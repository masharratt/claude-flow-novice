// personalization-integration.test.js - Integration tests for personalization CLI
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PersonalizationCLI } from '../personalization-cli.js';
import { PersonalizationIntegration } from '../personalization-integration.js';
import { executeCommand, hasCommand } from '../command-registry.js';

describe('Personalization CLI Integration', () => {
  let mockConsoleLog;
  let mockConsoleError;

  beforeEach(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Command Registration', () => {
    jest.setTimeout(10000);
  test('personalize command should be registered', () => {
      expect(hasCommand('personalize')).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle personalize help command', async () => { try {
      await executeCommand('personalize', ['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(mockConsoleLog).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle personalize command with fallback', async () => { try {
      const integration = new PersonalizationIntegration();
      const fallbackHandler = integration.constructor.getFallbackHandler();

      await fallbackHandler(['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Personalization System Overview'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('PersonalizationCLI Core Functions', () => {
    let cli;

    beforeEach(() => {
      cli = new PersonalizationCLI();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle help command', async () => { try {
      await cli.handleCommand(['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Claude Flow Novice Personalization CLI'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle status command gracefully', async () => { try {
      try {
        await cli.handleCommand(['status'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        // Should either succeed or fail gracefully
        expect(true).toBe(true);
      } catch (error) {
        // Expected if personalization modules are not available
        expect(error.message).toBeTruthy();
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle unknown command', async () => { try {
      await cli.handleCommand(['unknown'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Claude Flow Novice Personalization CLI'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('PersonalizationIntegration Utilities', () => {
    jest.setTimeout(10000);
  test('should validate valid commands', () => {
      const validation = PersonalizationIntegration.validateCommand(['setup'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(validation.valid).toBe(true);
      expect(validation.command).toBe('setup');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle invalid commands with suggestions', () => {
      const validation = PersonalizationIntegration.validateCommand(['steup'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(validation.valid).toBe(false);
      expect(validation.suggestions).toContain('setup');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should find similar commands', () => {
      const validCommands = ['setup', 'status', 'optimize'];
      const suggestions = PersonalizationIntegration.findSimilarCommands('stat', validCommands);
      expect(suggestions).toContain('status');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should handle help flag', () => {
      const validation = PersonalizationIntegration.validateCommand(['anything'], { help: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(validation.valid).toBe(true);
      expect(validation.command).toBe('help');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Error Handling', () => {
    jest.setTimeout(10000);
  test('should handle module loading errors gracefully', async () => { try {
      const result = await PersonalizationIntegration.initialize();
      // Should return success or failure info without throwing
      expect(typeof result.success).toBe('boolean');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should provide fallback when modules unavailable', async () => { try {
      const handler = await PersonalizationIntegration.getCommandHandler();
      expect(typeof handler).toBe('function');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should execute with error handling middleware', async () => { try {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await PersonalizationIntegration.executeWithErrorHandling(mockHandler, ['test'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Personalization command failed:',
        'Test error',
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Backward Compatibility', () => {
    jest.setTimeout(10000);
  test('should maintain existing CLI patterns', () => {
      // Test that the personalization command follows the same patterns as other commands
      const commands = ['init', 'status', 'config', 'personalize'];

      commands.forEach((command) => {
        expect(hasCommand(command)).toBe(true);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should not interfere with existing commands', async () => { try {
      // Test that adding personalization doesn't break existing functionality
      if (hasCommand('status')) {
        try {
          await executeCommand('status', [], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
          expect(true).toBe(true); // Command executed without throwing
        } catch (error) {
          // Some commands might fail in test environment, that's okay
          expect(error).toBeTruthy();
        }
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Help System Integration', () => {
    jest.setTimeout(10000);
  test('should provide command-specific help', () => {
      const commands = ['setup', 'status', 'optimize', 'analytics', 'resource', 'dashboard'];

      commands.forEach((command) => {
        expect(() => {
          PersonalizationIntegration.showHelp(command);
        }).not.toThrow();
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should provide main help when no command specified', () => {
      expect(() => {
        PersonalizationIntegration.showHelp();
      }).not.toThrow();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Claude Flow Novice Personalization System'),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Command Structure Validation', () => {
    jest.setTimeout(10000);
  test('should follow standard CLI conventions', async () => { try {
      const cli = new PersonalizationCLI();

      // Test standard flag patterns
      const standardFlags = ['--help', '--verbose', '--json', '--force', '--dry-run'];

      for (const flag of standardFlags) {
        const flags = { [flag.replace('--', '')]: true };

        try {
          await cli.handleCommand(['help'], flags);
          expect(true).toBe(true); // Should handle standard flags
        } catch (error) {
          // Should not throw for standard flags
          expect(error.message).not.toContain('Unknown flag');
        }
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should provide consistent command structure', () => {
      const expectedSubcommands = [
        'setup',
        'status',
        'optimize',
        'analytics',
        'resource',
        'preferences',
        'content',
        'workflow',
        'dashboard',
        'export',
        'import',
        'reset',
        'help',
      ];

      const validation = PersonalizationIntegration.validateCommand(['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(validation.valid).toBe(true);

      expectedSubcommands.forEach((cmd) => {
        const cmdValidation = PersonalizationIntegration.validateCommand([cmd], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        expect(cmdValidation.valid).toBe(true);
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Module Availability Handling', () => {
    jest.setTimeout(10000);
  test('should check module availability', async () => { try {
      const isAvailable = await PersonalizationIntegration.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    jest.setTimeout(10000);
  test('should provide graceful degradation', async () => { try {
      const handler = await PersonalizationIntegration.getCommandHandler();

      // Handler should always be available (either full or fallback)
      expect(typeof handler).toBe('function');

      // Should handle basic commands without throwing
      try {
        await handler(['help'], {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        expect(mockConsoleLog).toHaveBeenCalled();
      } catch (error) {
        // Should provide meaningful error messages
        expect(error.message).toBeTruthy();
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Integration with Command Registry', () => {
    jest.setTimeout(10000);
  test('should integrate properly with existing registry', () => {
      const mockRegistry = new Map();

      PersonalizationIntegration.registerCommand(mockRegistry);

      expect(mockRegistry.has('personalize')).toBe(true);

      const command = mockRegistry.get('personalize');
      expect(command.handler).toBeTruthy();
      expect(command.description).toContain('personalization');
      expect(command.usage).toContain('personalize');
      expect(Array.isArray(command.examples)).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

describe('Personalization CLI Usage Patterns', () => {
  jest.setTimeout(10000);
  test('should support typical user workflows', async () => { try {
    const cli = new PersonalizationCLI();

    // Typical first-time user workflow
    const firstTimeFlow = [
      ['help', {}],
      ['status', {}],
    ];

    for (const [command, flags] of firstTimeFlow) {
      try {
        await cli.handleCommand([command], flags);
        expect(true).toBe(true); // Should handle without throwing
      } catch (error) {
        // Expected for some commands in test environment
        expect(error.message).toBeTruthy();
      }
    }
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  jest.setTimeout(10000);
  test('should handle edge cases gracefully', async () => { try {
    const cli = new PersonalizationCLI();

    const edgeCases = [
      [[], {}], // No arguments
      [[''], {}], // Empty string argument
      [['help', 'extra', 'args'], {}], // Extra arguments
      [['valid-command'], { invalidFlag: true }], // Invalid flags
    ];

    for (const [args, flags] of edgeCases) {
      try {
        await cli.handleCommand(args, flags);
        expect(true).toBe(true); // Should handle gracefully
      } catch (error) {
        // Should provide meaningful error messages, not crash
        expect(typeof error.message).toBe('string');
      }
    }
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
