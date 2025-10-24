/**
 * Test Suite for Hello World Functions
 * Comprehensive testing of greeting functionality
 */

import { 
  helloWorld, 
  hello, 
  helloInLanguage, 
  helloFormal, 
  helloEnthusiastic,
  testHelloWorld 
} from './hello-world.js';

describe('Hello World Functions', () => {
  
  describe('helloWorld', () => {
    jest.setTimeout(10000);
  test('should return "Hello, World!"', () => {
      expect(helloWorld()).toBe('Hello, World!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('hello', () => {
    jest.setTimeout(10000);
  test('should greet with default name "World"', () => {
      expect(hello()).toBe('Hello, World!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should greet with custom name', () => {
      expect(hello('Alice')).toBe('Hello, Alice!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle different name formats', () => {
      expect(hello('John Doe')).toBe('Hello, John Doe!');
      expect(hello('123')).toBe('Hello, 123!');
      expect(hello('')).toBe('Hello, !');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('helloInLanguage', () => {
    jest.setTimeout(10000);
  test('should default to English greeting', () => {
      expect(helloInLanguage('en', 'World')).toBe('Hello, World!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Spanish', () => {
      expect(helloInLanguage('es', 'Maria')).toBe('Hola, Maria!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in French', () => {
      expect(helloInLanguage('fr', 'Pierre')).toBe('Bonjour, Pierre!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in German', () => {
      expect(helloInLanguage('de', 'Hans')).toBe('Hallo, Hans!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Italian', () => {
      expect(helloInLanguage('it', 'Marco')).toBe('Ciao, Marco!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Portuguese', () => {
      expect(helloInLanguage('pt', 'Sofia')).toBe('Olá, Sofia!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Russian', () => {
      expect(helloInLanguage('ru', 'Ivan')).toBe('Привет, Ivan!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Chinese', () => {
      expect(helloInLanguage('zh', 'Li')).toBe('你好, Li!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Japanese', () => {
      expect(helloInLanguage('ja', 'Taro')).toBe('こんにちは, Taro!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting in Korean', () => {
      expect(helloInLanguage('ko', 'Min')).toBe('안녕하세요, Min!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should default to English for unknown language', () => {
      expect(helloInLanguage('unknown', 'World')).toBe('Hello, World!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle default name parameter', () => {
      expect(helloInLanguage('es')).toBe('Hola, World!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('helloFormal', () => {
    jest.setTimeout(10000);
  test('should return informal greeting by default', () => {
      expect(helloFormal('Alice')).toBe('Hello, Alice!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return formal greeting when formal=true', () => {
      expect(helloFormal('Bob', true)).toBe('Good day, Bob.');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle formal greeting with different names', () => {
      expect(helloFormal('Dr. Smith', true)).toBe('Good day, Dr. Smith.');
      expect(helloFormal('Ms. Johnson', true)).toBe('Good day, Ms. Johnson.');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle default name parameter', () => {
      expect(helloFormal(undefined, true)).toBe('Good day, World.');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('helloEnthusiastic', () => {
    jest.setTimeout(10000);
  test('should return basic greeting with enthusiasm level 1', () => {
      expect(helloEnthusiastic('Alice', 1)).toBe('Hello!, Alice!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return greeting with moderate enthusiasm (level 3)', () => {
      expect(helloEnthusiastic('Bob', 3)).toBe('Hello!!!, Bob!!!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should return maximum enthusiasm (level 5)', () => {
      expect(helloEnthusiastic('Charlie', 5)).toBe('Hello!!!!!, Charlie!!!!!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle enthusiasm level above maximum', () => {
      expect(helloEnthusiastic('Dave', 10)).toBe('Hello!!!!!, Dave!!!!!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle enthusiasm level below minimum', () => {
      expect(helloEnthusiastic('Eve', 0)).toBe('Hello!, Eve!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle negative enthusiasm level', () => {
      expect(helloEnthusiastic('Frank', -1)).toBe('Hello!, Frank!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle default enthusiasm level', () => {
      expect(helloEnthusiastic('Grace')).toBe('Hello!, Grace!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('testHelloWorld', () => {
    jest.setTimeout(10000);
  test('should return comprehensive test results', () => {
      const results = testHelloWorld();
      
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('results');
      expect(results).toHaveProperty('summary');
      expect(typeof results.passed).toBe('boolean');
      expect(typeof results.results).toBe('object');
      expect(Array.isArray(results.summary)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should pass all basic tests', () => {
      const results = testHelloWorld();
      expect(results.passed).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Edge Cases', () => {
    jest.setTimeout(10000);
  test('should handle special characters in names', () => {
      expect(hello('José María')).toBe('Hello, José María!');
      expect(hello('O\'Brien')).toBe('Hello, O\'Brien!');
      expect(hello('Zoë')).toBe('Hello, Zoë!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle numeric names', () => {
      expect(hello('42')).toBe('Hello, 42!');
      expect(hello('0')).toBe('Hello, 0!');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle empty string names', () => {
      expect(hello('')).toBe('Hello, !');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Performance', () => {
    jest.setTimeout(10000);
  test('should execute quickly', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        hello('Test');
      }
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});