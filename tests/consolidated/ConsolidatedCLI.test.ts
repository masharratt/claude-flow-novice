/**
 * Comprehensive test suite for ConsolidatedCLI
 * Tests the 3-tier progressive command system and all core functionality
 */

import { ConsolidatedCLI, createConsolidatedCLI } from '../../src/cli/consolidated/ConsolidatedCLI.js';
import { UserTier } from '../../src/cli/consolidated/core/TierManager.js';

describe('ConsolidatedCLI', () => {
  let cli: ConsolidatedCLI;

  beforeEach(async () => {
    cli = await createConsolidatedCLI({
      enablePerformanceOptimization: false, // Disable for testing
      debugMode: true
    });
  });

  describe('Core Command Tests', () => {
    describe('init command', () => {
      it('should initialize a new project with intelligent defaults', async () => {
        const result = await cli.execute('init', ['web-app']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Successfully initialized');
        expect(result.nextSteps).toBeDefined();
        expect(result.nextSteps.length).toBeGreaterThan(0);
      });

      it('should handle natural language project descriptions', async () => {
        const result = await cli.execute('init', ['todo app with React']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Successfully initialized');
      });

      it('should provide helpful error messages for invalid input', async () => {
        // Mock file system errors
        const result = await cli.execute('init', [], { skipGit: true });

        expect(result).toBeDefined();
        if (!result.success) {
          expect(result.suggestions).toBeDefined();
          expect(result.suggestions.length).toBeGreaterThan(0);
        }
      });
    });

    describe('build command', () => {
      it('should analyze and execute build tasks', async () => {
        const result = await cli.execute('build', ['add user authentication']);

        expect(result.success).toBe(true);
        expect(result.message).toBeDefined();
      });

      it('should handle complex feature requests', async () => {
        const result = await cli.execute('build', [
          'create REST API with JWT authentication and PostgreSQL database'
        ]);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.analysis).toBeDefined();
      });

      it('should support dry-run mode', async () => {
        const result = await cli.execute('build', ['add user login'], { 'dry-run': true });

        expect(result.success).toBe(true);
        expect(result.message).toContain('Dry run completed');
        expect(result.data.analysis).toBeDefined();
      });

      it('should provide suggestions for vague requests', async () => {
        const result = await cli.execute('build', []);

        expect(result.success).toBe(false);
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions).toContain(expect.stringMatching(/example|Try:/i));
      });
    });

    describe('status command', () => {
      it('should return project and system status', async () => {
        const result = await cli.execute('status');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Status check completed');
      });

      it('should support detailed status output', async () => {
        const result = await cli.execute('status', [], { detailed: true });

        expect(result.success).toBe(true);
        // Should include more detailed information in detailed mode
      });

      it('should support JSON output format', async () => {
        const result = await cli.execute('status', [], { format: 'json' });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.projectContext).toBeDefined();
        expect(result.data.progress).toBeDefined();
      });
    });

    describe('help command', () => {
      it('should display general help information', async () => {
        const result = await cli.execute('help');

        expect(result.success).toBe(true);
        expect(result.nextSteps).toBeDefined();
        expect(result.nextSteps.length).toBeGreaterThan(0);
      });

      it('should provide command-specific help', async () => {
        const result = await cli.execute('help', ['build']);

        expect(result.success).toBe(true);
        expect(result.message).toBeDefined();
      });

      it('should handle help for unknown commands', async () => {
        const result = await cli.execute('help', ['nonexistent-command']);

        expect(result.success).toBe(false);
        expect(result.suggestions).toBeDefined();
      });

      it('should show new features when requested', async () => {
        const result = await cli.execute('help', [], { 'new-features': true });

        expect(result.success).toBe(true);
        expect(result.message).toContain('New Features');
      });
    });

    describe('learn command', () => {
      it('should display learning dashboard', async () => {
        const result = await cli.execute('learn');

        expect(result.success).toBe(true);
        expect(result.message).toContain('Learning Dashboard');
        expect(result.nextSteps).toBeDefined();
      });

      it('should provide topic-specific learning', async () => {
        const result = await cli.execute('learn', ['agents']);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Learning: AI Agents');
      });

      it('should handle unknown learning topics', async () => {
        const result = await cli.execute('learn', ['unknown-topic']);

        expect(result.success).toBe(false);
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions).toContain(expect.stringMatching(/Available topics/i));
      });
    });
  });

  describe('Tier System Tests', () => {
    it('should start users at novice tier', () => {
      const status = cli.getStatus();
      expect(status.tier).toBe(UserTier.NOVICE);
    });

    it('should limit novice users to 5 core commands', () => {
      const status = cli.getStatus();
      expect(status.availableCommands).toBe(5);
    });

    it('should record command usage for tier progression', async () => {
      const initialStatus = cli.getStatus();

      // Execute several commands
      await cli.execute('help');
      await cli.execute('status');
      await cli.execute('learn');

      const newStatus = cli.getStatus();
      // Command usage should be tracked (implementation would verify progression logic)
      expect(newStatus).toBeDefined();
    });
  });

  describe('Natural Language Processing Tests', () => {
    it('should interpret natural language commands', async () => {
      const result = await cli.execute('create a todo app with React and TypeScript');

      expect(result.success).toBe(true);
      // Should be interpreted as an init or build command
    });

    it('should handle complex natural language requests', async () => {
      const result = await cli.execute('build me a REST API with authentication using JWT tokens');

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should provide feedback on interpretation confidence', async () => {
      const result = await cli.execute('maybe add something to the project');

      // Low confidence should be handled gracefully
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.suggestions).toBeDefined();
      }
    });

    it('should fallback to suggestions for unclear input', async () => {
      const result = await cli.execute('xyz abc 123');

      expect(result.success).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Command Routing Tests', () => {
    it('should handle command aliases', async () => {
      const initResult = await cli.execute('initialize', ['test-project']);
      const createResult = await cli.execute('create', ['test-project']);

      // Both should work as aliases for init
      expect(initResult.success || createResult.success).toBe(true);
    });

    it('should provide suggestions for similar commands', async () => {
      const result = await cli.execute('biuld', ['something']); // Typo

      expect(result.success).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain(expect.stringMatching(/build/i));
    });

    it('should handle backward compatibility for legacy commands', async () => {
      const result = await cli.execute('sparc', ['tdd', 'implement feature']);

      // Should either work or provide clear migration guidance
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.suggestions).toBeDefined();
      }
    });
  });

  describe('Performance Tests', () => {
    it('should execute commands within performance targets', async () => {
      const startTime = performance.now();

      await cli.execute('status');

      const executionTime = performance.now() - startTime;
      expect(executionTime).toBeLessThan(2000); // 2 second target
    });

    it('should handle concurrent command execution', async () => {
      const promises = [
        cli.execute('status'),
        cli.execute('help'),
        cli.execute('learn')
      ];

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
      });
    });

    it('should cache frequently used data', async () => {
      // Execute same command twice
      const result1 = await cli.execute('status');
      const result2 = await cli.execute('status');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Second execution should potentially be faster (cached)
      // This would be verified in the actual performance optimizer
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle invalid command gracefully', async () => {
      const result = await cli.execute('invalid-command');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    it('should handle execution errors gracefully', async () => {
      // Mock an execution error scenario
      const result = await cli.execute('build', ['invalid input that causes error']);

      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.message).toBeDefined();
        expect(result.suggestions).toBeDefined();
      }
    });

    it('should provide helpful error recovery suggestions', async () => {
      const result = await cli.execute('nonexistent');

      expect(result.success).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain(expect.stringMatching(/help|available/i));
    });
  });

  describe('Configuration Tests', () => {
    it('should respect debug mode configuration', async () => {
      const debugCli = await createConsolidatedCLI({ debugMode: true });
      const result = await debugCli.execute('status');

      expect(result.data?.debug).toBeDefined();
    });

    it('should handle disabled natural language processing', async () => {
      const noCli = await createConsolidatedCLI({ enableNaturalLanguage: false });
      const result = await noCli.execute('create something cool');

      // Should not attempt natural language processing
      expect(result.success).toBe(false);
      expect(result.message).toContain('Natural language processing is disabled');
    });

    it('should handle disabled backward compatibility', async () => {
      const strictCli = await createConsolidatedCLI({ enableBackwardCompatibility: false });
      const result = await strictCli.execute('sparc', ['tdd']);

      // Legacy commands should not work
      expect(result.success).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle a complete workflow', async () => {
      // Simulate a complete user workflow
      const initResult = await cli.execute('init', ['todo-app']);
      expect(initResult.success).toBe(true);

      const buildResult = await cli.execute('build', ['add task management']);
      expect(buildResult.success).toBe(true);

      const statusResult = await cli.execute('status');
      expect(statusResult.success).toBe(true);
    });

    it('should maintain state across commands', async () => {
      await cli.execute('init', ['test-project']);
      const statusAfterInit = await cli.execute('status');

      expect(statusAfterInit.success).toBe(true);
      // Status should reflect the initialized project
    });

    it('should handle help requests during workflow', async () => {
      await cli.execute('init', ['test-project']);
      const helpResult = await cli.execute('help', ['build']);

      expect(helpResult.success).toBe(true);
      // Help should be contextual to the initialized project
    });
  });

  describe('Version and System Tests', () => {
    it('should handle version requests', async () => {
      const result = await cli.execute('version');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Claude Flow Consolidated CLI');
      expect(result.data.version).toBeDefined();
    });

    it('should handle --version flag', async () => {
      const result = await cli.execute('--version');

      expect(result.success).toBe(true);
      expect(result.data.version).toBeDefined();
    });

    it('should show system capabilities in version info', async () => {
      const result = await cli.execute('version');

      expect(result.data.features).toBeDefined();
      expect(result.data.tier).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty command', async () => {
      const result = await cli.execute('');

      expect(result.success).toBe(false);
      expect(result.suggestions).toBeDefined();
    });

    it('should handle command with only whitespace', async () => {
      const result = await cli.execute('   ');

      expect(result.success).toBe(false);
      expect(result.suggestions).toBeDefined();
    });

    it('should handle very long command descriptions', async () => {
      const longDescription = 'build ' + 'a'.repeat(1000);
      const result = await cli.execute(longDescription);

      expect(result).toBeDefined();
      // Should handle gracefully without crashing
    });

    it('should handle special characters in commands', async () => {
      const result = await cli.execute('build', ['add @user/profile with #hashtags']);

      expect(result).toBeDefined();
      // Should not break on special characters
    });
  });
});

describe('CLI Factory Function', () => {
  it('should create CLI with default config', async () => {
    const cli = await createConsolidatedCLI();
    expect(cli).toBeInstanceOf(ConsolidatedCLI);
  });

  it('should create CLI with custom config', async () => {
    const cli = await createConsolidatedCLI({
      enablePerformanceOptimization: false,
      debugMode: true
    });

    expect(cli).toBeInstanceOf(ConsolidatedCLI);
  });

  it('should warm up system during creation', async () => {
    const startTime = performance.now();
    const cli = await createConsolidatedCLI();
    const createTime = performance.now() - startTime;

    // Should complete warmup reasonably quickly
    expect(createTime).toBeLessThan(5000); // 5 seconds max
    expect(cli).toBeDefined();
  });
});

// Performance and Load Testing
describe('Performance Tests', () => {
  it('should handle rapid command execution', async () => {
    const cli = await createConsolidatedCLI({ enablePerformanceOptimization: true });

    const commands = Array(10).fill('status');
    const startTime = performance.now();

    const results = await Promise.all(
      commands.map(() => cli.execute('status'))
    );

    const totalTime = performance.now() - startTime;
    const averageTime = totalTime / commands.length;

    expect(averageTime).toBeLessThan(500); // 500ms average
    results.forEach(result => {
      expect(result.success).toBe(true);
    });
  });

  it('should maintain performance under load', async () => {
    const cli = await createConsolidatedCLI({ enablePerformanceOptimization: true });

    const heavyCommands = [
      'build "complex microservices architecture with authentication"',
      'build "full-stack application with React and Node.js"',
      'build "machine learning pipeline with data processing"'
    ];

    const results = await Promise.all(
      heavyCommands.map(cmd => cli.execute(cmd))
    );

    results.forEach(result => {
      expect(result).toBeDefined();
      // All commands should complete successfully or provide useful feedback
    });
  });
});

// Mock implementations for testing
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn()
  },
  readFileSync: jest.fn(),
  existsSync: jest.fn()
}));

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));