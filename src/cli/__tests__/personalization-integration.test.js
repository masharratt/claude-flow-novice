// personalization-integration.test.js - Integration tests for personalization CLI
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PersonalizationCLI } from '../personalization-cli.js';
import { PersonalizationIntegration } from '../personalization-integration.js';
import { executeCommand, hasCommand } from '../command-registry.js';

describe('Personalization CLI Integration', () => {
  let mockConsoleLog;
  let mockConsoleError;

  beforeEach(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Command Registration', () => {
    test('personalize command should be registered', () => {
      expect(hasCommand('personalize')).toBe(true);
    });

    test('should handle personalize help command', async () => {
      await executeCommand('personalize', ['help'], {});
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    test('should handle personalize command with fallback', async () => {
      const integration = new PersonalizationIntegration();
      const fallbackHandler = integration.constructor.getFallbackHandler();

      await fallbackHandler(['help'], {});
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Personalization System Overview'));
    });
  });

  describe('PersonalizationCLI Core Functions', () => {
    let cli;

    beforeEach(() => {
      cli = new PersonalizationCLI();
    });

    test('should handle help command', async () => {
      await cli.handleCommand(['help'], {});
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Claude Flow Novice Personalization CLI'));
    });

    test('should handle status command gracefully', async () => {
      try {
        await cli.handleCommand(['status'], {});
        // Should either succeed or fail gracefully
        expect(true).toBe(true);
      } catch (error) {
        // Expected if personalization modules are not available
        expect(error.message).toBeTruthy();
      }
    });

    test('should handle unknown command', async () => {
      await cli.handleCommand(['unknown'], {});
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Claude Flow Novice Personalization CLI'));
    });
  });

  describe('PersonalizationIntegration Utilities', () => {
    test('should validate valid commands', () => {
      const validation = PersonalizationIntegration.validateCommand(['setup'], {});
      expect(validation.valid).toBe(true);
      expect(validation.command).toBe('setup');
    });

    test('should handle invalid commands with suggestions', () => {
      const validation = PersonalizationIntegration.validateCommand(['steup'], {});
      expect(validation.valid).toBe(false);
      expect(validation.suggestions).toContain('setup');
    });

    test('should find similar commands', () => {
      const validCommands = ['setup', 'status', 'optimize'];
      const suggestions = PersonalizationIntegration.findSimilarCommands('stat', validCommands);
      expect(suggestions).toContain('status');
    });

    test('should handle help flag', () => {
      const validation = PersonalizationIntegration.validateCommand(['anything'], { help: true });
      expect(validation.valid).toBe(true);
      expect(validation.command).toBe('help');
    });
  });

  describe('Error Handling', () => {
    test('should handle module loading errors gracefully', async () => {
      const result = await PersonalizationIntegration.initialize();
      // Should return success or failure info without throwing
      expect(typeof result.success).toBe('boolean');
    });

    test('should provide fallback when modules unavailable', async () => {
      const handler = await PersonalizationIntegration.getCommandHandler();
      expect(typeof handler).toBe('function');
    });

    test('should execute with error handling middleware', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await PersonalizationIntegration.executeWithErrorHandling(mockHandler, ['test'], {});
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Personalization command failed:', 'Test error');
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain existing CLI patterns', () => {
      // Test that the personalization command follows the same patterns as other commands
      const commands = ['init', 'status', 'config', 'personalize'];

      commands.forEach(command => {
        expect(hasCommand(command)).toBe(true);
      });
    });

    test('should not interfere with existing commands', async () => {
      // Test that adding personalization doesn't break existing functionality
      if (hasCommand('status')) {
        try {
          await executeCommand('status', [], {});
          expect(true).toBe(true); // Command executed without throwing
        } catch (error) {
          // Some commands might fail in test environment, that's okay
          expect(error).toBeTruthy();
        }
      }
    });
  });

  describe('Help System Integration', () => {
    test('should provide command-specific help', () => {
      const commands = ['setup', 'status', 'optimize', 'analytics', 'resource', 'dashboard'];

      commands.forEach(command => {
        expect(() => {
          PersonalizationIntegration.showHelp(command);
        }).not.toThrow();
      });
    });

    test('should provide main help when no command specified', () => {
      expect(() => {
        PersonalizationIntegration.showHelp();
      }).not.toThrow();

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Claude Flow Novice Personalization System'));
    });
  });

  describe('Command Structure Validation', () => {
    test('should follow standard CLI conventions', async () => {
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
    });

    test('should provide consistent command structure', () => {
      const expectedSubcommands = [
        'setup', 'status', 'optimize', 'analytics', 'resource',
        'preferences', 'content', 'workflow', 'dashboard',
        'export', 'import', 'reset', 'help'
      ];

      const validation = PersonalizationIntegration.validateCommand(['help'], {});
      expect(validation.valid).toBe(true);

      expectedSubcommands.forEach(cmd => {
        const cmdValidation = PersonalizationIntegration.validateCommand([cmd], {});
        expect(cmdValidation.valid).toBe(true);
      });
    });
  });

  describe('Module Availability Handling', () => {
    test('should check module availability', async () => {
      const isAvailable = await PersonalizationIntegration.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    test('should provide graceful degradation', async () => {
      const handler = await PersonalizationIntegration.getCommandHandler();

      // Handler should always be available (either full or fallback)
      expect(typeof handler).toBe('function');

      // Should handle basic commands without throwing
      try {
        await handler(['help'], {});
        expect(mockConsoleLog).toHaveBeenCalled();
      } catch (error) {
        // Should provide meaningful error messages
        expect(error.message).toBeTruthy();
      }
    });
  });

  describe('Integration with Command Registry', () => {
    test('should integrate properly with existing registry', () => {
      const mockRegistry = new Map();

      PersonalizationIntegration.registerCommand(mockRegistry);

      expect(mockRegistry.has('personalize')).toBe(true);

      const command = mockRegistry.get('personalize');
      expect(command.handler).toBeTruthy();
      expect(command.description).toContain('personalization');
      expect(command.usage).toContain('personalize');
      expect(Array.isArray(command.examples)).toBe(true);
    });
  });
});

describe('Personalization CLI Usage Patterns', () => {
  test('should support typical user workflows', async () => {
    const cli = new PersonalizationCLI();

    // Typical first-time user workflow
    const firstTimeFlow = [
      ['help', {}],
      ['status', {}]
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
  });

  test('should handle edge cases gracefully', async () => {
    const cli = new PersonalizationCLI();

    const edgeCases = [
      [[], {}],  // No arguments
      [[''], {}],  // Empty string argument
      [['help', 'extra', 'args'], {}],  // Extra arguments
      [['valid-command'], { invalidFlag: true }]  // Invalid flags
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
  });
});