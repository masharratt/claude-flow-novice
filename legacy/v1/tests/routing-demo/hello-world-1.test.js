describe('Hello World 1', () => {
  test('prints Hello World 1 and passes', () => {
    const message = 'Hello World 1';
    console.log(message);
    expect(message).toBe('Hello World 1');
  });
});
