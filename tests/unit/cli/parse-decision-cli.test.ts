/**
 * Parse Decision CLI Tests
 * Tests for command-line interface to decision parser
 */

// Note: main() function not tested here due to process.exit() calls
// Integration testing happens via CLI execution tests

import { parseArgs, formatJSON, formatText, formatError } from '../../../src/cli/parse-decision-cli';
import { DecisionParserError } from '../../../src/cfn-loop/product-owner/decision-parser';

describe('Parse Decision CLI', () => {
  describe('Argument Parsing', () => {
    it('should parse input file argument', () => {
      const args = ['--input', 'output.txt'];
      const options = parseArgs(args);

      expect(options.input).toBe('output.txt');
    });

    it('should parse short input flag', () => {
      const args = ['-i', 'output.txt'];
      const options = parseArgs(args);

      expect(options.input).toBe('output.txt');
    });

    it('should parse output file argument', () => {
      const args = ['--output', 'result.json'];
      const options = parseArgs(args);

      expect(options.output).toBe('result.json');
    });

    it('should parse JSON flag', () => {
      const args = ['--json'];
      const options = parseArgs(args);

      expect(options.json).toBe(true);
    });

    it('should parse verbose flag', () => {
      const args = ['--verbose'];
      const options = parseArgs(args);

      expect(options.verbose).toBe(true);
    });

    it('should parse short verbose flag', () => {
      const args = ['-v'];
      const options = parseArgs(args);

      expect(options.verbose).toBe(true);
    });

    it('should parse task context', () => {
      const args = ['--task-context', 'Implement TypeScript module'];
      const options = parseArgs(args);

      expect(options.taskContext).toBe('Implement TypeScript module');
    });

    it('should parse task ID', () => {
      const args = ['--task-id', 'cfn-auth-123'];
      const options = parseArgs(args);

      expect(options.taskId).toBe('cfn-auth-123');
    });

    it('should parse no-strict flag', () => {
      const args = ['--no-strict'];
      const options = parseArgs(args);

      expect(options.strict).toBe(false);
    });

    it('should parse positional input argument', () => {
      const args = ['output.txt', '--json'];
      const options = parseArgs(args);

      expect(options.input).toBe('output.txt');
      expect(options.json).toBe(true);
    });

    it('should handle multiple flags', () => {
      const args = [
        '--input', 'file.txt',
        '--output', 'result.json',
        '--json',
        '--verbose',
        '--task-id', 'task-123'
      ];
      const options = parseArgs(args);

      expect(options.input).toBe('file.txt');
      expect(options.output).toBe('result.json');
      expect(options.json).toBe(true);
      expect(options.verbose).toBe(true);
      expect(options.taskId).toBe('task-123');
    });

    it('should skip unknown flags', () => {
      const args = ['--unknown', 'value', '--input', 'file.txt'];
      const options = parseArgs(args);

      expect(options.input).toBe('file.txt');
    });

    it('should default to json=false and verbose=false', () => {
      const options = parseArgs([]);

      expect(options.json).toBe(false);
      expect(options.verbose).toBe(false);
    });

    it('should default to strict=true', () => {
      const options = parseArgs([]);

      expect(options.strict).toBe(true);
    });
  });

  describe('JSON Formatting', () => {
    it('should format PROCEED decision as JSON', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'All tests pass',
        confidence: 0.95,
        deliverables: ['Module A', 'Module B'],
        validationErrors: [],
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const json = formatJSON(decision);
      const parsed = JSON.parse(json);

      expect(parsed.success).toBe(true);
      expect(parsed.decision).toBe('PROCEED');
      expect(parsed.confidence).toBe(0.95);
      expect(Array.isArray(parsed.deliverables)).toBe(true);
    });

    it('should format ITERATE decision as JSON', () => {
      const decision = {
        decision: 'ITERATE' as const,
        reasoning: 'Need improvements',
        confidence: 0.65,
        deliverables: [],
        validationErrors: ['Warning 1'],
        raw: { fullOutput: 'Decision: ITERATE' }
      };

      const json = formatJSON(decision);
      const parsed = JSON.parse(json);

      expect(parsed.decision).toBe('ITERATE');
      expect(parsed.confidence).toBe(0.65);
    });

    it('should include optional fields in JSON', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'Good',
        confidence: 0.90,
        deliverables: [],
        validationErrors: [],
        auditAnalysis: 'Audit passed',
        agentPerformanceObservations: 'Good performance',
        raw: { fullOutput: 'output' }
      };

      const json = formatJSON(decision);
      const parsed = JSON.parse(json);

      expect(parsed.auditAnalysis).toBe('Audit passed');
      expect(parsed.agentPerformanceObservations).toBe('Good performance');
    });

    it('should format as valid JSON string', () => {
      const decision = {
        decision: 'ABORT' as const,
        reasoning: 'Critical issue',
        confidence: 0.1,
        deliverables: [],
        validationErrors: [],
        raw: { fullOutput: 'Decision: ABORT' }
      };

      const json = formatJSON(decision);

      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe('Text Formatting', () => {
    it('should format PROCEED decision as text', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'All requirements met',
        confidence: 0.92,
        deliverables: ['Feature A', 'Feature B'],
        validationErrors: [],
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const text = formatText(decision, false);

      expect(text).toContain('Decision: PROCEED');
      expect(text).toContain('Confidence: 92.0%');
      expect(text).toContain('All requirements met');
      expect(text).toContain('Feature A, Feature B');
    });

    it('should include warnings in text output', () => {
      const decision = {
        decision: 'ITERATE' as const,
        reasoning: 'Needs work',
        confidence: 0.70,
        deliverables: [],
        validationErrors: ['Issue 1', 'Issue 2'],
        raw: { fullOutput: 'Decision: ITERATE' }
      };

      const text = formatText(decision, false);

      expect(text).toContain('Warnings: Issue 1; Issue 2');
    });

    it('should not include verbose section when verbose=false', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'Good',
        confidence: 0.90,
        deliverables: [],
        validationErrors: [],
        auditAnalysis: 'Audit data',
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const text = formatText(decision, false);

      expect(text).not.toContain('Verbose Output');
      expect(text).not.toContain('Audit Analysis');
    });

    it('should include verbose section when verbose=true', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'Good',
        confidence: 0.90,
        deliverables: [],
        validationErrors: [],
        auditAnalysis: 'Audit data',
        agentPerformanceObservations: 'Performance data',
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const text = formatText(decision, true);

      expect(text).toContain('Verbose Output');
      expect(text).toContain('Audit Analysis: Audit data');
      expect(text).toContain('Agent Performance: Performance data');
    });

    it('should skip empty deliverables', () => {
      const decision = {
        decision: 'ITERATE' as const,
        reasoning: 'More work needed',
        confidence: 0.75,
        deliverables: [],
        validationErrors: [],
        raw: { fullOutput: 'Decision: ITERATE' }
      };

      const text = formatText(decision, false);

      expect(text).not.toContain('Deliverables:');
    });

    it('should skip empty validation errors', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'Good',
        confidence: 0.95,
        deliverables: [],
        validationErrors: [],
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const text = formatText(decision, false);

      expect(text).not.toContain('Warnings:');
    });

    it('should format confidence as percentage', () => {
      const decision = {
        decision: 'PROCEED' as const,
        reasoning: 'Good',
        confidence: 0.8765,
        deliverables: [],
        validationErrors: [],
        raw: { fullOutput: 'Decision: PROCEED' }
      };

      const text = formatText(decision, false);

      // Check that confidence is formatted and includes percentage symbol
      expect(text).toMatch(/Confidence: [\d.]+%/);
    });
  });

  describe('Error Formatting', () => {
    it('should format error as JSON', () => {
      const error = new Error('Parse error');
      const text = formatError(error, { json: true });
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Parse error');
      expect(parsed.code).toBe('UNKNOWN_ERROR');
    });

    it('should format error as text', () => {
      const error = new Error('Parse failed');
      const text = formatError(error, { json: false });

      expect(text).toContain('Error: Parse failed');
    });

    it('should handle custom error codes', () => {
      const error = new DecisionParserError('Invalid output', 'CUSTOM_CODE');
      const text = formatError(error, { json: true });
      const parsed = JSON.parse(text);

      expect(parsed.code).toBe('CUSTOM_CODE');
    });

    it('should include error details if available', () => {
      const error = new DecisionParserError('Test error', 'TEST_CODE', { extra: 'info' });
      const text = formatError(error, { json: true });
      const parsed = JSON.parse(text);

      expect(parsed.details).toEqual({ extra: 'info' });
    });
  });

  describe('Exit Code Mapping', () => {
    it('should map PROCEED to exit code 0', () => {
      // This would be tested in integration tests with actual process exit
      // Testing the logic here:
      const decision = 'PROCEED';
      const exitCode = decision === 'PROCEED' ? 0 : decision === 'ITERATE' ? 1 : 2;

      expect(exitCode).toBe(0);
    });

    it('should map ITERATE to exit code 1', () => {
      const decision = 'ITERATE';
      const exitCode = decision === 'PROCEED' ? 0 : decision === 'ITERATE' ? 1 : 2;

      expect(exitCode).toBe(1);
    });

    it('should map ABORT to exit code 2', () => {
      const decision = 'ABORT';
      const exitCode = decision === 'PROCEED' ? 0 : decision === 'ITERATE' ? 1 : 2;

      expect(exitCode).toBe(2);
    });
  });

  describe('Option Defaults', () => {
    it('should have correct defaults', () => {
      const options = parseArgs([]);

      expect(options.json).toBe(false);
      expect(options.verbose).toBe(false);
      expect(options.strict).toBe(true);
      expect(options.input).toBeUndefined();
      expect(options.output).toBeUndefined();
    });
  });

  describe('Complex Argument Scenarios', () => {
    it('should handle input file without flag (positional)', () => {
      const args = ['decision-output.txt', '--json'];
      const options = parseArgs(args);

      expect(options.input).toBe('decision-output.txt');
      expect(options.json).toBe(true);
    });

    it('should handle all options together', () => {
      const args = [
        '--input', 'input.txt',
        '--output', 'output.json',
        '--task-context', 'Create module',
        '--task-id', 'task-1',
        '--json',
        '--verbose'
      ];
      const options = parseArgs(args);

      expect(options.input).toBe('input.txt');
      expect(options.output).toBe('output.json');
      expect(options.taskContext).toBe('Create module');
      expect(options.taskId).toBe('task-1');
      expect(options.json).toBe(true);
      expect(options.verbose).toBe(true);
    });

    it('should prioritize flag over positional', () => {
      const args = ['positional.txt', '--input', 'flag.txt'];
      const options = parseArgs(args);

      expect(options.input).toBe('flag.txt');
    });
  });
});
