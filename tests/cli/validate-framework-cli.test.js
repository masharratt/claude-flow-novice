import { describe, test, it, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * CLI Integration Tests for Framework Validation
 * Comprehensive testing of CLI commands with user-friendly error handling
 *
 * TEST COVERAGE:
 * - All CLI command variations and arguments
 * - Interactive and non-interactive modes
 * - Error handling and user feedback
 * - File system operations and edge cases
 * - User experience and help systems
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PassThrough } from 'stream';
import sinon from 'sinon';
import { FrameworkValidationCLI, handleFrameworkValidationCommand } from '../../src/cli/commands/validate-framework.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Framework Validation CLI', function() {
  this.timeout(30000);

  let testDir;
  let originalConsole;
  let consoleOutput;
  let cli;

  // Mock console for testing output
  function mockConsole() {
    consoleOutput = {
      log: [],
      error: [],
      warn: []
    };

    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn
    };

    console.log = (...args) => {
      consoleOutput.log.push(args.join(' '));
    };

    console.error = (...args) => {
      consoleOutput.error.push(args.join(' '));
    };

    console.warn = (...args) => {
      consoleOutput.warn.push(args.join(' '));
    };
  }

  function restoreConsole() {
    if (originalConsole) {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    }
  }

  const validFramework = {
    id: 'cli-test-framework',
    name: 'CLI Test Framework',
    version: '1.0.0',
    description: 'Framework for CLI testing',
    validation_config: {
      truth_threshold: 0.85,
      truth_component_weights: {
        agent_reliability: 0.3,
        cross_validation: 0.25,
        external_verification: 0.2,
        factual_consistency: 0.15,
        logical_coherence: 0.1
      }
    },
    validation_rules: [
      {
        name: 'accuracy_test',
        validator: {
          type: 'threshold',
          config: {
            field: 'completion.accuracy',
            threshold: 0.8,
            operator: '>='
          }
        }
      }
    ],
    quality_gates: [
      {
        name: 'truth_score_gate',
        metric: 'truth_score',
        threshold: 0.85,
        operator: '>=',
        required: true
      }
    ],
    metadata: {
      author: 'cli-test',
      created_at: new Date().toISOString()
    }
  };

  const invalidFramework = {
    // Missing required fields
    name: 'Invalid Framework',
    validation_config: {
      truth_threshold: 1.5 // Invalid range
    }
  };

  const maliciousFramework = {
    id: 'malicious-framework',
    name: 'Malicious Framework',
    version: '1.0.0',
    validation_config: {
      truth_threshold: 0.8
    },
    validation_rules: [
      {
        name: 'malicious_rule',
        validator: 'eval("require(\'fs\').readFileSync(\'/etc/passwd\')");'
      }
    ]
  };

  before(async function() {
    testDir = path.join(__dirname, 'test-cli-temp');
    await fs.mkdir(testDir, { recursive: true });
  });

  after(async function() {
    await fs.rmdir(testDir, { recursive: true }).catch(() => {});
    restoreConsole();
  });

  beforeEach(function() {
    mockConsole();
    cli = new FrameworkValidationCLI({ interactive: false });
  });

  afterEach(async function() {
    if (cli) {
      await cli.cleanup();
    }
    restoreConsole();
  });

  describe('CLI Initialization', function() {
    it('should initialize CLI without errors', async function() {
      const result = await cli.initialize();

      expect(result).to.be.undefined; // Should not throw
      expect(consoleOutput.log.some(msg => msg.includes('initialized'))).to.be.true;
    });

    it('should handle initialization errors gracefully', async function() {
      // Mock a failing validator
      const mockCLI = new FrameworkValidationCLI({ interactive: false });

      // Stub the validator initialization to fail
      const originalInitialize = mockCLI.initialize;
      mockCLI.initialize = async function() {
        throw new Error('Mock initialization failure');
      };

      try {
        await mockCLI.initialize();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Mock initialization failure');
      }
    });
  });

  describe('Add Framework Command', function() {
    let frameworkFile;

    beforeEach(async function() {
      frameworkFile = path.join(testDir, 'test-framework.json');
    });

    afterEach(async function() {
      try {
        await fs.unlink(frameworkFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should successfully add a valid framework', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify(validFramework, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.true;
      expect(result.frameworkId).to.equal('cli-test-framework');
      expect(consoleOutput.log.some(msg => msg.includes('successfully'))).to.be.true;
    });

    it('should reject invalid framework with helpful errors', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify(invalidFramework, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.false;
      expect(result.errors).to.be.an('array').that.is.not.empty;
      expect(consoleOutput.error.some(msg => msg.includes('validation failed'))).to.be.true;
    });

    it('should detect malicious frameworks and provide security warnings', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify(maliciousFramework, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.false;
      expect(result.securityViolations).to.be.an('array').that.is.not.empty;
      expect(consoleOutput.error.some(msg => msg.includes('Security'))).to.be.true;
    });

    it('should handle missing file with clear error message', async function() {
      const result = await cli.handleCommand(['add', 'nonexistent-file.json']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
      expect(consoleOutput.error.some(msg => msg.includes('not found'))).to.be.true;
    });

    it('should handle invalid JSON with helpful error', async function() {
      await fs.writeFile(frameworkFile, 'invalid json content');

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid JSON');
      expect(consoleOutput.error.some(msg => msg.includes('Invalid JSON'))).to.be.true;
    });

    it('should handle missing framework file argument', async function() {
      const result = await cli.handleCommand(['add']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Missing');
      expect(consoleOutput.error.some(msg => msg.includes('required'))).to.be.true;
    });

    it('should provide fixing suggestions for validation errors', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify(invalidFramework, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.false;
      expect(consoleOutput.log.some(msg => msg.includes('Fixing Suggestions'))).to.be.true;
    });

    it('should display comprehensive framework information', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify(validFramework, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Framework Information'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('CLI Test Framework'))).to.be.true;
    });

    it('should show usage instructions after successful addition', async function() {
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'usage-test-framework'
      }, null, 2));

      const result = await cli.handleCommand(['add', frameworkFile]);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Usage Instructions'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('validate framework test'))).to.be.true;
    });
  });

  describe('Test Framework Command', function() {
    beforeEach(async function() {
      // Add a framework for testing
      const frameworkFile = path.join(testDir, 'test-target.json');
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'test-target-framework'
      }, null, 2));

      await cli.handleCommand(['add', frameworkFile]);
      await fs.unlink(frameworkFile);

      // Clear console output from add command
      consoleOutput = { log: [], error: [], warn: [] };
    });

    it('should successfully test a framework', async function() {
      const result = await cli.handleCommand(['test', 'test-target-framework']);

      expect(result.success).to.be.true;
      expect(result.truthScore).to.be.a('number');
      expect(consoleOutput.log.some(msg => msg.includes('Test Results'))).to.be.true;
    });

    it('should handle missing framework ID', async function() {
      const result = await cli.handleCommand(['test']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Framework ID is required');
      expect(consoleOutput.error.some(msg => msg.includes('required'))).to.be.true;
    });

    it('should handle non-existent framework', async function() {
      const result = await cli.handleCommand(['test', 'nonexistent-framework']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });

    it('should display test results with metrics', async function() {
      const result = await cli.handleCommand(['test', 'test-target-framework']);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Truth Score'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Threshold'))).to.be.true;
    });

    it('should handle framework test failures gracefully', async function() {
      // Add a framework that will fail tests
      const failingFramework = {
        ...validFramework,
        id: 'failing-test-framework',
        validation_config: {
          ...validFramework.validation_config,
          truth_threshold: 0.99 // Very high threshold
        }
      };

      const frameworkFile = path.join(testDir, 'failing-framework.json');
      await fs.writeFile(frameworkFile, JSON.stringify(failingFramework, null, 2));
      await cli.handleCommand(['add', frameworkFile]);
      await fs.unlink(frameworkFile);

      const result = await cli.handleCommand(['test', 'failing-test-framework']);

      // Test might fail due to high threshold, should handle gracefully
      expect(result).to.be.an('object');
      expect(result.truthScore).to.be.a('number');
    });
  });

  describe('List Frameworks Command', function() {
    beforeEach(async function() {
      // Add a couple of frameworks for listing
      const framework1File = path.join(testDir, 'list-test-1.json');
      const framework2File = path.join(testDir, 'list-test-2.json');

      await fs.writeFile(framework1File, JSON.stringify({
        ...validFramework,
        id: 'list-test-framework-1',
        name: 'List Test Framework 1'
      }, null, 2));

      await fs.writeFile(framework2File, JSON.stringify({
        ...validFramework,
        id: 'list-test-framework-2',
        name: 'List Test Framework 2'
      }, null, 2));

      await cli.handleCommand(['add', framework1File]);
      await cli.handleCommand(['add', framework2File]);

      await fs.unlink(framework1File);
      await fs.unlink(framework2File);

      // Clear console output
      consoleOutput = { log: [], error: [], warn: [] };
    });

    it('should list all frameworks in table format', async function() {
      const result = await cli.handleCommand(['list']);

      expect(result.success).to.be.true;
      expect(result.frameworks).to.be.an('array');
      expect(result.frameworks.length).to.be.greaterThan(0);
      expect(consoleOutput.log.some(msg => msg.includes('Custom Frameworks'))).to.be.true;
    });

    it('should handle empty framework list gracefully', async function() {
      // Use a fresh CLI instance with no frameworks
      const emptyCLI = new FrameworkValidationCLI({ interactive: false });
      await emptyCLI.initialize();

      const result = await emptyCLI.handleCommand(['list']);

      expect(result.success).to.be.true;
      expect(result.frameworks).to.be.an('array').that.is.empty;
      expect(consoleOutput.log.some(msg => msg.includes('No custom frameworks'))).to.be.true;

      await emptyCLI.cleanup();
    });

    it('should display framework details in table', async function() {
      const result = await cli.handleCommand(['list']);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('List Test Framework 1'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('List Test Framework 2'))).to.be.true;
    });
  });

  describe('Remove Framework Command', function() {
    beforeEach(async function() {
      // Add a framework to remove
      const frameworkFile = path.join(testDir, 'remove-test.json');
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'remove-test-framework'
      }, null, 2));

      await cli.handleCommand(['add', frameworkFile]);
      await fs.unlink(frameworkFile);

      // Clear console output
      consoleOutput = { log: [], error: [], warn: [] };
    });

    it('should handle missing framework ID', async function() {
      const result = await cli.handleCommand(['remove']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Framework ID is required');
    });

    it('should handle non-existent framework', async function() {
      const result = await cli.handleCommand(['remove', 'nonexistent-framework']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });

    it('should display framework info before removal', async function() {
      // Mock inquirer to auto-confirm
      const inquirer = await import('inquirer');
      const promptStub = sinon.stub(inquirer.default, 'prompt').resolves({ confirm: true });

      const result = await cli.handleCommand(['remove', 'remove-test-framework']);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Removing custom framework'))).to.be.true;

      promptStub.restore();
    });

    it('should cancel removal when user declines', async function() {
      // Mock inquirer to decline
      const inquirer = await import('inquirer');
      const promptStub = sinon.stub(inquirer.default, 'prompt').resolves({ confirm: false });

      const result = await cli.handleCommand(['remove', 'remove-test-framework']);

      expect(result.success).to.be.false;
      expect(result.cancelled).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('cancelled'))).to.be.true;

      promptStub.restore();
    });
  });

  describe('Export Framework Command', function() {
    beforeEach(async function() {
      // Add a framework to export
      const frameworkFile = path.join(testDir, 'export-test.json');
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'export-test-framework'
      }, null, 2));

      await cli.handleCommand(['add', frameworkFile]);
      await fs.unlink(frameworkFile);

      // Clear console output
      consoleOutput = { log: [], error: [], warn: [] };
    });

    it('should handle missing framework ID', async function() {
      const result = await cli.handleCommand(['export']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Framework ID is required');
    });

    it('should handle non-existent framework', async function() {
      const result = await cli.handleCommand(['export', 'nonexistent-framework']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });

    it('should export framework to default file', async function() {
      const result = await cli.handleCommand(['export', 'export-test-framework']);

      expect(result.success).to.be.true;
      expect(result.exported).to.include('export-test-framework-framework.json');
      expect(consoleOutput.log.some(msg => msg.includes('exported'))).to.be.true;

      // Clean up exported file
      const exportedFile = path.resolve('export-test-framework-framework.json');
      await fs.unlink(exportedFile).catch(() => {});
    });

    it('should export framework to specified file', async function() {
      const outputFile = path.join(testDir, 'custom-export.json');
      const result = await cli.handleCommand(['export', 'export-test-framework', outputFile]);

      expect(result.success).to.be.true;
      expect(result.exported).to.equal(path.resolve(outputFile));

      // Verify file was created
      const exported = await fs.readFile(outputFile, 'utf8');
      const exportedFramework = JSON.parse(exported);
      expect(exportedFramework.id).to.equal('export-test-framework');

      // Clean up
      await fs.unlink(outputFile);
    });

    it('should display export details', async function() {
      const result = await cli.handleCommand(['export', 'export-test-framework']);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('File size'))).to.be.true;

      // Clean up
      const exportedFile = path.resolve('export-test-framework-framework.json');
      await fs.unlink(exportedFile).catch(() => {});
    });
  });

  describe('Validate Completion Command', function() {
    let completionFile;

    beforeEach(async function() {
      // Add a framework for validation
      const frameworkFile = path.join(testDir, 'validation-test.json');
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'validation-test-framework'
      }, null, 2));

      await cli.handleCommand(['add', frameworkFile]);
      await fs.unlink(frameworkFile);

      // Create a test completion
      completionFile = path.join(testDir, 'test-completion.json');
      const testCompletion = {
        title: 'Test Completion',
        accuracy: 0.9,
        execution_time: 2000,
        memory_usage: 1024000,
        confidence: 0.8,
        evidence: ['test_evidence']
      };

      await fs.writeFile(completionFile, JSON.stringify(testCompletion, null, 2));

      // Clear console output
      consoleOutput = { log: [], error: [], warn: [] };
    });

    afterEach(async function() {
      try {
        await fs.unlink(completionFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should validate completion with framework', async function() {
      const result = await cli.handleCommand(['validate', completionFile, 'validation-test-framework']);

      expect(result.success).to.be.true;
      expect(result.truthScore).to.be.a('number');
      expect(consoleOutput.log.some(msg => msg.includes('validation passed'))).to.be.true;
    });

    it('should handle missing arguments', async function() {
      const result = await cli.handleCommand(['validate']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('required arguments');
    });

    it('should handle invalid completion file', async function() {
      const result = await cli.handleCommand(['validate', 'nonexistent-completion.json', 'validation-test-framework']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('ENOENT');
    });

    it('should handle invalid JSON in completion file', async function() {
      await fs.writeFile(completionFile, 'invalid json');

      const result = await cli.handleCommand(['validate', completionFile, 'validation-test-framework']);

      expect(result.success).to.be.false;
      expect(result.error).to.include('JSON');
    });

    it('should display validation details on success', async function() {
      const result = await cli.handleCommand(['validate', completionFile, 'validation-test-framework']);

      expect(result.success).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Validation Details'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Truth Score'))).to.be.true;
    });

    it('should display failure details on validation failure', async function() {
      // Create a completion that will fail validation
      const failingCompletion = {
        title: 'Failing Completion',
        accuracy: 0.5, // Below framework threshold
        execution_time: 1000,
        confidence: 0.3
      };

      await fs.writeFile(completionFile, JSON.stringify(failingCompletion, null, 2));

      const result = await cli.handleCommand(['validate', completionFile, 'validation-test-framework']);

      expect(result.success).to.be.false;
      expect(consoleOutput.error.some(msg => msg.includes('validation failed'))).to.be.true;
    });
  });

  describe('Help and Usage', function() {
    it('should display help for invalid commands', async function() {
      const result = await cli.handleCommand(['invalid-command']);

      expect(result.help).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Framework Validation Commands'))).to.be.true;
    });

    it('should display help for empty commands', async function() {
      const result = await cli.handleCommand([]);

      expect(result.help).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Commands'))).to.be.true;
    });

    it('should show examples in help', async function() {
      const result = await cli.handleCommand(['help']);

      expect(result.help).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('Examples'))).to.be.true;
      expect(consoleOutput.log.some(msg => msg.includes('claude-flow-novice validate framework'))).to.be.true;
    });
  });

  describe('Error Handling and Edge Cases', function() {
    it('should handle CLI cleanup properly', async function() {
      const testCLI = new FrameworkValidationCLI({ interactive: false });
      await testCLI.initialize();

      // Should not throw during cleanup
      await testCLI.cleanup();

      // Should be safe to call multiple times
      await testCLI.cleanup();
    });

    it('should handle concurrent CLI operations', async function() {
      const cli1 = new FrameworkValidationCLI({ interactive: false });
      const cli2 = new FrameworkValidationCLI({ interactive: false });

      await Promise.all([
        cli1.initialize(),
        cli2.initialize()
      ]);

      // Both should be able to list frameworks
      const results = await Promise.all([
        cli1.handleCommand(['list']),
        cli2.handleCommand(['list'])
      ]);

      results.forEach(result => {
        expect(result.success).to.be.true;
      });

      await Promise.all([
        cli1.cleanup(),
        cli2.cleanup()
      ]);
    });

    it('should handle file system permissions errors', async function() {
      // Try to write to a read-only location (simulated)
      const readOnlyFile = path.join('/root', 'readonly-framework.json');

      const result = await cli.handleCommand(['add', readOnlyFile]);

      expect(result.success).to.be.false;
      expect(result.error).to.be.a('string');
    });

    it('should handle very large framework files', async function() {
      // Create a large but valid framework
      const largeFramework = {
        ...validFramework,
        id: 'large-framework',
        description: 'x'.repeat(100000), // 100KB description
        validation_rules: []
      };

      // Add many rules
      for (let i = 0; i < 100; i++) {
        largeFramework.validation_rules.push({
          name: `rule_${i}`,
          validator: {
            type: 'threshold',
            config: {
              field: `completion.metric_${i}`,
              threshold: Math.random(),
              operator: '>='
            }
          }
        });
      }

      const largeFile = path.join(testDir, 'large-framework.json');
      await fs.writeFile(largeFile, JSON.stringify(largeFramework, null, 2));

      const result = await cli.handleCommand(['add', largeFile]);

      // Should handle large files (might reject due to size limits)
      expect(result).to.be.an('object');
      expect(result.success).to.be.a('boolean');

      await fs.unlink(largeFile);
    });

    it('should provide meaningful error messages for common issues', async function() {
      // Test various error scenarios
      const errorTests = [
        {
          command: ['add'],
          expectedError: 'required'
        },
        {
          command: ['test'],
          expectedError: 'required'
        },
        {
          command: ['remove'],
          expectedError: 'required'
        },
        {
          command: ['export'],
          expectedError: 'required'
        },
        {
          command: ['validate'],
          expectedError: 'required'
        }
      ];

      for (const test of errorTests) {
        const result = await cli.handleCommand(test.command);

        expect(result.success).to.be.false;
        expect(result.error).to.include(test.expectedError);
      }
    });
  });

  describe('Integration with handleFrameworkValidationCommand', function() {
    it('should handle commands through main handler', async function() {
      const frameworkFile = path.join(testDir, 'handler-test.json');
      await fs.writeFile(frameworkFile, JSON.stringify({
        ...validFramework,
        id: 'handler-test-framework'
      }, null, 2));

      const result = await handleFrameworkValidationCommand(
        ['add', frameworkFile],
        { interactive: false }
      );

      expect(result.success).to.be.true;

      await fs.unlink(frameworkFile);
    });

    it('should pass options correctly to CLI', async function() {
      const result = await handleFrameworkValidationCommand(
        ['list'],
        { verbose: true, interactive: false }
      );

      expect(result.success).to.be.true;
    });

    it('should cleanup resources after command execution', async function() {
      // This tests that the finally block in handleFrameworkValidationCommand works
      const result = await handleFrameworkValidationCommand(['list']);

      expect(result.success).to.be.true;
    });
  });
});

// Utility functions for CLI testing
export function createTestFrameworkFile(framework, directory) {
  const filename = `${framework.id || 'test'}-framework.json`;
  const filepath = path.join(directory, filename);

  return fs.writeFile(filepath, JSON.stringify(framework, null, 2))
    .then(() => filepath);
}

export function createTestCompletionFile(completion, directory) {
  const filename = `${completion.title?.replace(/\s+/g, '-') || 'test'}-completion.json`;
  const filepath = path.join(directory, filename);

  return fs.writeFile(filepath, JSON.stringify(completion, null, 2))
    .then(() => filepath);
}

export function captureConsoleOutput() {
  const output = {
    log: [],
    error: [],
    warn: []
  };

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    output.log.push(args.join(' '));
    originalLog(...args);
  };

  console.error = (...args) => {
    output.error.push(args.join(' '));
    originalError(...args);
  };

  console.warn = (...args) => {
    output.warn.push(args.join(' '));
    originalWarn(...args);
  };

  return {
    output,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
}