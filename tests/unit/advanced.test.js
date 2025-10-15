const QuickTest = require('./quick-test');

const qt = new QuickTest();

// Test complex scenarios
qt.test('Promise chain', async () => {
  const result = await Promise.resolve(1)
    .then(x => x + 1)
    .then(x => x * 2)
    .then(x => x - 1);
  
  qt.assertEqual(result, 3);
});

qt.test('Array methods', () => {
  const numbers = [1, 2, 3, 4, 5];
  
  // Map
  const doubled = numbers.map(x => x * 2);
  qt.assertEqual(doubled.length, 5);
  qt.assertEqual(doubled[0], 2);
  qt.assertEqual(doubled[4], 10);
  
  // Filter
  const evens = numbers.filter(x => x % 2 === 0);
  qt.assertEqual(evens.length, 2);
  qt.assert(evens.includes(2));
  qt.assert(evens.includes(4));
  
  // Reduce
  const sum = numbers.reduce((acc, x) => acc + x, 0);
  qt.assertEqual(sum, 15);
});

qt.test('Object manipulation', () => {
  const user = {
    name: 'John',
    age: 30,
    address: {
      city: 'New York',
      country: 'USA'
    }
  };
  
  qt.assertEqual(user.name, 'John');
  qt.assertEqual(user.age, 30);
  qt.assertEqual(user.address.city, 'New York');
  
  // Object spread
  const updatedUser = { ...user, age: 31 };
  qt.assertEqual(updatedUser.age, 31);
  qt.assertEqual(updatedUser.name, 'John');
});

qt.test('Error scenarios', () => {
  function validateAge(age) {
    if (typeof age !== 'number') {
      throw new Error('Age must be a number');
    }
    if (age < 0) {
      throw new Error('Age cannot be negative');
    }
    return age;
  }
  
  qt.assertEqual(validateAge(25), 25);
  qt.assertThrows(() => validateAge('25'), 'Should throw for string');
  qt.assertThrows(() => validateAge(-5), 'Should throw for negative');
});

qt.test('Timeout simulation', async () => {
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  const start = Date.now();
  await delay(10);
  const end = Date.now();
  
  qt.assert(end - start >= 10, 'Should wait at least 10ms');
});

qt.test('Complex data structures', () => {
  const matrix = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9]
  ];
  
  // Sum diagonal
  const diagonalSum = matrix.reduce((sum, row, i) => sum + row[i], 0);
  qt.assertEqual(diagonalSum, 15);
  
  // Flatten array
  const flattened = matrix.flat();
  qt.assertEqual(flattened.length, 9);
  qt.assertEqual(flattened[0], 1);
  qt.assertEqual(flattened[8], 9);
});

module.exports = qt;