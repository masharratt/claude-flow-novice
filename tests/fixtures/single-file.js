
const subtract = require('./single-file-impl');
test('subtracts numbers', () => {
    expect(subtract(5, 3)).toBe(2);
});
