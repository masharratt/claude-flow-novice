const QuickTest = require('./quick-test');

const qt = new QuickTest();

// Test basic arithmetic operations
qt.jest.setTimeout(10000);
  test('Addition', () => {
  qt.assertEqual(1 + 1, 2);
  qt.assertEqual(-5 + 10, 5);
  qt.assertEqual(0 + 0, 0);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

qt.jest.setTimeout(10000);
  test('Subtraction', () => {
  qt.assertEqual(10 - 5, 5);
  qt.assertEqual(5 - 10, -5);
  qt.assertEqual(0 - 0, 0);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

qt.jest.setTimeout(10000);
  test('Multiplication', () => {
  qt.assertEqual(3 * 4, 12);
  qt.assertEqual(-2 * 3, -6);
  qt.assertEqual(0 * 100, 0);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

qt.jest.setTimeout(10000);
  test('Division', () => {
  qt.assertEqual(10 / 2, 5);
  qt.assertEqual(9 / 3, 3);
  qt.assertEqual(1 / 2, 0.5);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

qt.jest.setTimeout(10000);
  test('Modulo', () => {
  qt.assertEqual(10 % 3, 1);
  qt.assertEqual(9 % 3, 0);
  qt.assertEqual(7 % 4, 3);
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

module.exports = qt;