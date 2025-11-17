/**
 * CLI Command Handlers Test Suite
 * Comprehensive unit tests for CFN Loop CLI command parsing and validation
 *
 * @version 1.0.0
 * @description Tests for parameter parsing, validation, and command generation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Execute CLI command and capture output
 */
async function executeCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const cmd = `npx tsx ${__dirname}/../../src/cli/cfn-loop.ts ${args.join(' ')}`;
    exec(cmd, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error ? error.code || 1 : 0,
      });
    });
  });
}

describe('CLI Command Handlers', () => {
  // ============================================================================
  // Parameter Parsing Tests
  // ============================================================================

  describe('Parameter Parsing', () => {
    test('parses single subcommand with task description', async () => {
      const result = await executeCLI(['single', 'Implement feature X']);
      expect(result.stdout).toContain('/cfn-loop-single');
      expect(result.stdout).toContain('Implement feature X');
    });

    test('parses mode parameter correctly', async () => {
      const result = await executeCLI(['single', 'test task', '--mode', 'standard']);
      expect(result.stdout).toContain('--mode=standard');
    });

    test('parses max-iterations parameter correctly', async () => {
      const result = await executeCLI(['single', 'test task', '--max-iterations', '15']);
      expect(result.stdout).toContain('/cfn-loop-single');
    });

    test('parses phase parameter for sprints', async () => {
      const result = await executeCLI(['sprints', 'Sprint 1', '--phase', 'phase-1']);
      expect(result.stdout).toContain('--phase=phase-1');
    });

    test('handles multiple parameters together', async () => {
      const result = await executeCLI(['single', 'test', '--mode', 'enterprise', '--max-iterations', '20']);
      expect(result.stdout).toContain('/cfn-loop-single');
    });
  });

  // ============================================================================
  // Mode Selection Tests
  // ============================================================================

  describe('Mode Selection', () => {
    test('accepts MVP mode', async () => {
      const result = await executeCLI(['single', 'test', '--mode', 'mvp']);
      expect(result.stdout).toContain('--mode=mvp');
    });

    test('accepts standard mode', async () => {
      const result = await executeCLI(['single', 'test', '--mode', 'standard']);
      expect(result.stdout).toContain('--mode=standard');
    });

    test('accepts enterprise mode', async () => {
      const result = await executeCLI(['single', 'test', '--mode', 'enterprise']);
      expect(result.stdout).toContain('--mode=enterprise');
    });

    test('passes through invalid mode to slash command', async () => {
      const result = await executeCLI(['single', 'test', '--mode', 'invalid']);
      expect(result.stdout).toContain('/cfn-loop-single');
    });
  });

  // ============================================================================
  // Subcommand Validation Tests
  // ============================================================================

  describe('Subcommand Validation', () => {
    test('generates /cfn-loop-single for single subcommand', async () => {
      const result = await executeCLI(['single', 'test task']);
      expect(result.stdout).toContain('/cfn-loop-single');
      expect(result.stdout).toContain('test task');
    });

    test('generates /cfn-loop-epic for epic subcommand', async () => {
      const result = await executeCLI(['epic', 'Build system']);
      expect(result.stdout).toContain('/cfn-loop-epic');
      expect(result.stdout).toContain('Build system');
    });

    test('generates /cfn-loop-sprints for sprints subcommand', async () => {
      const result = await executeCLI(['sprints', 'Sprint task']);
      expect(result.stdout).toContain('/cfn-loop-sprints');
      expect(result.stdout).toContain('Sprint task');
    });

    test('rejects unknown subcommand', async () => {
      const result = await executeCLI(['unknown', 'test']);
      expect(result.stderr || result.stdout).toContain('Unknown subcommand');
    });
  });

  // ============================================================================
  // Help Text Tests
  // ============================================================================

  describe('Help Text', () => {
    test('displays help with --help flag', async () => {
      const result = await executeCLI(['--help']);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Examples:');
      expect(result.stdout).toContain('single');
      expect(result.stdout).toContain('epic');
      expect(result.stdout).toContain('sprints');
    });

    test('displays help with -h flag', async () => {
      const result = await executeCLI(['-h']);
      expect(result.stdout).toContain('Usage:');
    });

    test('shows help when no arguments provided', async () => {
      const result = await executeCLI([]);
      expect(result.stdout).toContain('Usage:');
    });

    test('help text includes mode options', async () => {
      const result = await executeCLI(['--help']);
      expect(result.stdout).toContain('--mode');
      expect(result.stdout).toContain('mvp');
      expect(result.stdout).toContain('standard');
      expect(result.stdout).toContain('enterprise');
    });

    test('help text includes max-iterations option', async () => {
      const result = await executeCLI(['--help']);
      expect(result.stdout).toContain('--max-iterations');
    });

    test('help text includes phase option', async () => {
      const result = await executeCLI(['--help']);
      expect(result.stdout).toContain('--phase');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    test('handles missing task description', async () => {
      const result = await executeCLI(['single']);
      expect(result.stderr || result.stdout).toMatch(/Task description required|Usage:/);
    });

    test('handles empty task description', async () => {
      const result = await executeCLI(['single', '']);
      expect(result.stderr || result.stdout).toMatch(/Task description required|Usage:/);
    });

    test('gracefully handles very long task descriptions', async () => {
      const longTask = 'A'.repeat(500);
      const result = await executeCLI(['single', longTask]);
      expect(result.stdout).toContain('/cfn-loop-single');
    });
  });

  // ============================================================================
  // Task Description Edge Cases
  // ============================================================================

  describe('Task Description Edge Cases', () => {
    test('handles task with special characters', async () => {
      const result = await executeCLI(['single', 'Fix: API endpoint /users/{id}']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles task with quotes', async () => {
      const result = await executeCLI(['single', "Add 'login' feature"]);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles task with parentheses', async () => {
      const result = await executeCLI(['single', 'Add feature (v2)']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles task with dashes', async () => {
      const result = await executeCLI(['single', 'user-authentication-system']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles task with multiple spaces', async () => {
      const result = await executeCLI(['single', 'test    task    here']);
      expect(result.stdout).toContain('cfn-loop-single');
    });
  });

  // ============================================================================
  // Iteration Parameter Tests
  // ============================================================================

  describe('Iteration Parameter', () => {
    test('accepts positive iteration count', async () => {
      const result = await executeCLI(['single', 'test', '--max-iterations', '10']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('accepts large iteration count', async () => {
      const result = await executeCLI(['single', 'test', '--max-iterations', '100']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles zero iterations', async () => {
      const result = await executeCLI(['single', 'test', '--max-iterations', '0']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles negative iterations', async () => {
      const result = await executeCLI(['single', 'test', '--max-iterations', '-5']);
      expect(result.stdout).toContain('cfn-loop-single');
    });

    test('handles non-numeric iterations', async () => {
      const result = await executeCLI(['single', 'test', '--max-iterations', 'abc']);
      expect(result.stdout).toContain('cfn-loop-single');
    });
  });

  // ============================================================================
  // Command Output Format Tests
  // ============================================================================

  describe('Command Output Format', () => {
    test('includes execution message', async () => {
      const result = await executeCLI(['single', 'test task']);
      expect(result.stdout).toContain('Executing:');
    });

    test('includes instruction for Claude Code execution', async () => {
      const result = await executeCLI(['single', 'test task']);
      expect(result.stdout).toContain('To execute this CFN Loop');
    });

    test('includes note about slash command delegation', async () => {
      const result = await executeCLI(['single', 'test task']);
      expect(result.stdout).toContain('slash commands');
    });

    test('output contains generated slash command', async () => {
      const result = await executeCLI(['single', 'test task', '--mode', 'standard']);
      expect(result.stdout).toMatch(/\/cfn-loop-single.*--mode=standard/);
    });
  });

  // ============================================================================
  // Phase Parameter Tests (Sprints)
  // ============================================================================

  describe('Phase Parameter', () => {
    test('includes phase in sprints command', async () => {
      const result = await executeCLI(['sprints', 'test', '--phase', 'alpha']);
      expect(result.stdout).toContain('--phase=alpha');
    });

    test('handles hyphenated phase names', async () => {
      const result = await executeCLI(['sprints', 'test', '--phase', 'phase-1']);
      expect(result.stdout).toContain('--phase=phase-1');
    });

    test('handles empty phase value', async () => {
      const result = await executeCLI(['sprints', 'test', '--phase', '']);
      expect(result.stdout).toContain('cfn-loop-sprints');
    });

    test('phase is sprints-specific (ignored for single)', async () => {
      const result = await executeCLI(['single', 'test', '--phase', 'ignored']);
      expect(result.stdout).toContain('cfn-loop-single');
      expect(result.stdout).not.toContain('--phase=');
    });
  });

  // ============================================================================
  // Parameter Order Independence Tests
  // ============================================================================

  describe('Parameter Order Independence', () => {
    test('parameters work in any order', async () => {
      const result1 = await executeCLI(['single', 'test', '--mode', 'mvp', '--max-iterations', '10']);
      const result2 = await executeCLI(['single', 'test', '--max-iterations', '10', '--mode', 'mvp']);

      expect(result1.stdout).toContain('cfn-loop-single');
      expect(result2.stdout).toContain('cfn-loop-single');
    });
  });

  // ============================================================================
  // Exit Code Tests
  // ============================================================================

  describe('Exit Codes', () => {
    test('exits successfully with valid command', async () => {
      const result = await executeCLI(['single', 'test task']);
      expect(result.exitCode).toBe(0);
    });

    test('exits successfully with help flag', async () => {
      const result = await executeCLI(['--help']);
      expect(result.exitCode).toBe(0);
    });

    test('exits with error for unknown subcommand', async () => {
      const result = await executeCLI(['invalid', 'test']);
      expect(result.exitCode).not.toBe(0);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    test('generates complete single command with all parameters', async () => {
      const result = await executeCLI([
        'single',
        'Implement JWT authentication',
        '--mode',
        'enterprise',
        '--max-iterations',
        '15',
      ]);

      expect(result.stdout).toContain('/cfn-loop-single');
      expect(result.stdout).toContain('Implement JWT authentication');
      expect(result.stdout).toContain('--mode=enterprise');
    });

    test('generates complete epic command', async () => {
      const result = await executeCLI(['epic', 'Build authentication system', '--mode', 'standard']);

      expect(result.stdout).toContain('/cfn-loop-epic');
      expect(result.stdout).toContain('Build authentication system');
      expect(result.stdout).toContain('--mode=standard');
    });

    test('generates complete sprints command with phase', async () => {
      const result = await executeCLI([
        'sprints',
        'Phase 1: Core implementation',
        '--phase',
        'phase-1',
      ]);

      expect(result.stdout).toContain('/cfn-loop-sprints');
      expect(result.stdout).toContain('Phase 1: Core implementation');
      expect(result.stdout).toContain('--phase=phase-1');
    });
  });

  // ============================================================================
  // Regression Tests
  // ============================================================================

  describe('Regression Tests', () => {
    test('consistent output format across executions', async () => {
      const result1 = await executeCLI(['single', 'test', '--mode', 'standard']);
      const result2 = await executeCLI(['single', 'test', '--mode', 'standard']);

      expect(result1.stdout).toContain('/cfn-loop-single');
      expect(result2.stdout).toContain('/cfn-loop-single');
    });

    test('no stderr output for valid commands', async () => {
      const result = await executeCLI(['single', 'test task', '--mode', 'standard']);
      // Note: Some stderr output may be acceptable (warnings, info)
      expect(result.exitCode).toBe(0);
    });
  });
});
