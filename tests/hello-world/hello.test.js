import { hello } from '../src/hello.js';
import assert from 'assert';

describe('hello function', () => {
  it('should return "Hello World"', () => {
    const result = hello();
    assert.strictEqual(result, "Hello World");
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  it('should return a string', () => {
    const result = hello();
    assert.strictEqual(typeof result, 'string');
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});