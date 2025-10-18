/**
 * Basic Infrastructure Test
 * Tests that Jest configuration and basic test execution works
 */

describe('Test Infrastructure', () => {
  test('should pass basic validation', () => {
    expect(true).toBe(true);
    expect(2 + 2).toBe(4);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  test('should handle mock imports', async () => {
    // Test that our mock modules can be imported using relative path
    const { UserConfigurationManager } = await import('../config/jest/mocks/truth-config-manager.js');
    const configManager = new UserConfigurationManager();

    expect(configManager).toBeDefined();
    expect(configManager.initialized).toBe(false);

    await configManager.initialize();
    expect(configManager.initialized).toBe(true);

    await configManager.shutdown();
    expect(configManager.initialized).toBe(false);
  });

  test('should have global test utilities', () => {
    // Test global utilities from jest.setup.cjs
    expect(typeof global.generateTestId).toBe('function');
    expect(typeof global.generateTestData).toBe('function');
    expect(typeof global.mockCLIEnvironment).toBe('object');

    const testId = global.generateTestId();
    expect(testId).toBeDefined();
    expect(typeof testId).toBe('string');

    const testData = global.generateTestData(5);
    expect(Array.isArray(testData)).toBe(true);
    expect(testData).toHaveLength(5);
  });
});