const { add, multiply } = require('./example.js');

describe('Math functions', () => {
    jest.setTimeout(10000);
  test('add should return sum of two numbers', () => {
        expect(add(2, 3)).toBe(5);
        expect(add(-1, 1)).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('multiply should return product of two numbers', () => {
        expect(multiply(2, 3)).toBe(6);
        expect(multiply(-2, 3)).toBe(-6);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});