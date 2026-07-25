/**
 * Skill Output Parser Tests
 * TDD test suite for Task 5.4: Eliminate Bash Output Parsing
 *
 * Tests structured JSON parsing from skill execution with legacy fallback
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SkillOutputParser, SkillOutput, SkillParseResult } from '../src/lib/skill-output-parser';
import { ErrorCode } from '../src/lib/errors';

describe('SkillOutputParser', () => {
  let parser: SkillOutputParser;

  beforeEach(() => {
    parser = new SkillOutputParser();
  });

  // ============================================================================
  // JSON Parsing Tests (Primary Path)
  // ============================================================================

  describe('JSON Output Parsing', () => {
    it('should parse valid JSON output successfully', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.92,
        deliverables: ['src/file.ts', 'tests/file.test.ts'],
        metrics: {
          execution_time_ms: 1234,
          files_modified: 2,
        },
        errors: [],
      });

      const result = parser.parse(jsonOutput);

      expect(result.success).toBe(true);
      expect(result.output.success).toBe(true);
      expect(result.output.confidence).toBe(0.92);
      expect(result.output.deliverables).toHaveLength(2);
      expect(result.output.metrics.execution_time_ms).toBe(1234);
      expect(result.errors).toHaveLength(0);
      expect(result.parseMethod).toBe('json');
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('should parse JSON output with errors', () => {
      const jsonOutput = JSON.stringify({
        success: false,
        confidence: 0.65,
        deliverables: [],
        metrics: {
          execution_time_ms: 567,
        },
        errors: [
          {
            code: 'VALIDATION_FAILED',
            message: 'Schema validation failed',
            context: { field: 'confidence' },
          },
        ],
      });

      const result = parser.parse(jsonOutput);

      expect(result.success).toBe(true); // Parsing succeeded
      expect(result.output.success).toBe(false); // Skill execution failed
      expect(result.output.errors).toHaveLength(1);
      expect(result.output.errors[0].code).toBe('VALIDATION_FAILED');
    });

    it('should parse JSON output with minimal required fields', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: [],
        metrics: {},
        errors: [],
      });

      const result = parser.parse(jsonOutput);

      expect(result.success).toBe(true);
      expect(result.output.confidence).toBe(0.85);
      expect(result.parseMethod).toBe('json');
    });

    it('should parse JSON output with custom metrics', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.88,
        deliverables: ['config.json'],
        metrics: {
          execution_time_ms: 890,
          files_modified: 1,
          custom_check_count: 15,
          custom_validation_score: 0.95,
        },
        errors: [],
      });

      const result = parser.parse(jsonOutput);

      expect(result.output.metrics.custom_check_count).toBe(15);
      expect(result.output.metrics.custom_validation_score).toBe(0.95);
    });

    it('should handle JSON output with empty deliverables', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.75,
        deliverables: [],
        metrics: { execution_time_ms: 100 },
        errors: [],
      });

      const result = parser.parse(jsonOutput);

      expect(result.success).toBe(true);
      expect(result.output.deliverables).toHaveLength(0);
    });
  });

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('Schema Validation', () => {
    it('should reject JSON missing required field: success', () => {
      const invalidJson = JSON.stringify({
        confidence: 0.85,
        deliverables: [],
        metrics: {},
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Missing required field: success')
      );
      expect(result.parseMethod).toBe('validation_failed');
    });

    it('should reject JSON missing required field: confidence', () => {
      const invalidJson = JSON.stringify({
        success: true,
        deliverables: [],
        metrics: {},
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Missing required field: confidence')
      );
    });

    it('should reject confidence out of range (> 1.0)', () => {
      const invalidJson = JSON.stringify({
        success: true,
        confidence: 1.5,
        deliverables: [],
        metrics: {},
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Confidence must be between 0.0 and 1.0')
      );
    });

    it('should reject confidence out of range (< 0.0)', () => {
      const invalidJson = JSON.stringify({
        success: true,
        confidence: -0.5,
        deliverables: [],
        metrics: {},
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Confidence must be between 0.0 and 1.0')
      );
    });

    it('should reject deliverables as non-array', () => {
      const invalidJson = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: 'not-an-array',
        metrics: {},
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Deliverables must be an array')
      );
    });

    it('should reject errors as non-array', () => {
      const invalidJson = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: [],
        metrics: {},
        errors: 'not-an-array',
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Errors must be an array')
      );
    });

    it('should reject metrics as non-object', () => {
      const invalidJson = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: [],
        metrics: 'not-an-object',
        errors: [],
      });

      const result = parser.parse(invalidJson);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('Metrics must be an object')
      );
    });
  });

  // ============================================================================
  // Legacy Parsing Tests (Fallback Path)
  // ============================================================================

  describe('Legacy Text Parsing', () => {
    it('should parse legacy text output with confidence marker', () => {
      const legacyOutput = `
Task completed successfully.
Created: src/auth.ts
Created: tests/auth.test.ts
Modified: package.json

Confidence: 0.87
`;

      const result = parser.parse(legacyOutput);

      expect(result.success).toBe(true);
      expect(result.output.confidence).toBe(0.87);
      expect(result.output.deliverables).toContain('src/auth.ts');
      expect(result.output.deliverables).toContain('tests/auth.test.ts');
      expect(result.output.deliverables).toContain('package.json');
      expect(result.parseMethod).toBe('legacy');
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Using legacy text parsing')
      );
    });

    it('should parse legacy output without explicit confidence', () => {
      const legacyOutput = `
Skill execution complete.
Created: docs/README.md
`;

      const result = parser.parse(legacyOutput);

      expect(result.success).toBe(true);
      expect(result.output.confidence).toBe(0.5); // Default confidence
      expect(result.output.deliverables).toContain('docs/README.md');
      expect(result.parseMethod).toBe('legacy');
    });

    it('should detect success patterns in legacy output', () => {
      const legacyOutput = 'SUCCESS: All tests passed';

      const result = parser.parse(legacyOutput);

      expect(result.success).toBe(true);
      expect(result.output.success).toBe(true);
      expect(result.parseMethod).toBe('legacy');
    });

    it('should detect failure patterns in legacy output', () => {
      const legacyOutput = 'ERROR: Validation failed';

      const result = parser.parse(legacyOutput);

      expect(result.success).toBe(true); // Parsing succeeded
      expect(result.output.success).toBe(false); // Skill execution failed
      expect(result.parseMethod).toBe('legacy');
    });

    it('should extract execution time from legacy output', () => {
      const legacyOutput = `
Task complete.
Execution time: 1234ms
`;

      const result = parser.parse(legacyOutput);

      expect(result.output.metrics.execution_time_ms).toBe(1234);
    });

    it('should extract files modified count from legacy output', () => {
      const legacyOutput = `
Modified 3 files
Created: file1.ts
Created: file2.ts
Modified: file3.ts
`;

      const result = parser.parse(legacyOutput);

      expect(result.output.metrics.files_modified).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty string input', () => {
      const result = parser.parse('');

      expect(result.success).toBe(true);
      expect(result.output.success).toBe(false);
      expect(result.output.confidence).toBe(0.0);
      expect(result.parseMethod).toBe('legacy');
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Empty input')
      );
    });

    it('should handle whitespace-only input', () => {
      const result = parser.parse('   \n\t  \n  ');

      expect(result.success).toBe(true);
      expect(result.output.success).toBe(false);
      expect(result.parseMethod).toBe('legacy');
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{ success: true, confidence: }';

      const result = parser.parse(malformedJson);

      expect(result.success).toBe(true); // Falls back to legacy
      expect(result.parseMethod).toBe('legacy');
    });

    it('should handle very large JSON output', () => {
      const largeOutput = {
        success: true,
        confidence: 0.85,
        deliverables: Array(1000).fill('file.ts'),
        metrics: {
          execution_time_ms: 5000,
          files_modified: 1000,
        },
        errors: [],
      };

      const result = parser.parse(JSON.stringify(largeOutput));

      expect(result.success).toBe(true);
      expect(result.output.deliverables).toHaveLength(1000);
    });

    it('should handle mixed JSON and text output (JSON wins)', () => {
      const mixedOutput = `
Some text before
${JSON.stringify({
  success: true,
  confidence: 0.9,
  deliverables: [],
  metrics: {},
  errors: [],
})}
Some text after
`;

      const result = parser.parse(mixedOutput);

      expect(result.success).toBe(true);
      expect(result.parseMethod).toBe('json');
      expect(result.output.confidence).toBe(0.9);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should parse JSON output in <10ms', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: ['file1.ts', 'file2.ts'],
        metrics: { execution_time_ms: 100 },
        errors: [],
      });

      const startTime = performance.now();
      parser.parse(jsonOutput);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should validate JSON schema in <50ms', () => {
      const jsonOutput = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: ['file.ts'],
        metrics: {},
        errors: [],
      });

      const startTime = performance.now();
      const result = parser.parse(jsonOutput);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration with Real Skill Outputs', () => {
    it('should parse output from coordination skill', () => {
      const coordinationOutput = JSON.stringify({
        success: true,
        confidence: 0.95,
        deliverables: [],
        metrics: {
          execution_time_ms: 234,
          agents_coordinated: 3,
        },
        errors: [],
      });

      const result = parser.parse(coordinationOutput);

      expect(result.success).toBe(true);
      expect(result.output.metrics.agents_coordinated).toBe(3);
    });

    it('should parse output from validation skill', () => {
      const validationOutput = JSON.stringify({
        success: true,
        confidence: 0.88,
        deliverables: ['validation-report.json'],
        metrics: {
          execution_time_ms: 1567,
          validations_passed: 12,
          validations_failed: 1,
        },
        errors: [
          {
            code: 'SCHEMA_MISMATCH',
            message: 'Field type mismatch',
          },
        ],
      });

      const result = parser.parse(validationOutput);

      expect(result.success).toBe(true);
      expect(result.output.metrics.validations_passed).toBe(12);
      expect(result.output.errors).toHaveLength(1);
    });
  });

  // ============================================================================
  // Batch Parsing Tests
  // ============================================================================

  describe('Batch Parsing', () => {
    it('should parse multiple outputs in batch', () => {
      const outputs = [
        JSON.stringify({ success: true, confidence: 0.9, deliverables: [], metrics: {}, errors: [] }),
        JSON.stringify({ success: true, confidence: 0.85, deliverables: [], metrics: {}, errors: [] }),
        'Legacy output text',
      ];

      const results = parser.parseBatch(outputs);

      expect(results).toHaveLength(3);
      expect(results[0].parseMethod).toBe('json');
      expect(results[1].parseMethod).toBe('json');
      expect(results[2].parseMethod).toBe('legacy');
    });

    it('should handle empty batch', () => {
      const results = parser.parseBatch([]);

      expect(results).toHaveLength(0);
    });

    it('should continue parsing on individual failures', () => {
      const outputs = [
        JSON.stringify({ success: true, confidence: 0.9, deliverables: [], metrics: {}, errors: [] }),
        '', // Empty
        JSON.stringify({ success: true, confidence: 0.85, deliverables: [], metrics: {}, errors: [] }),
      ];

      const results = parser.parseBatch(outputs);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true); // Falls back to legacy
      expect(results[2].success).toBe(true);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Parser Configuration', () => {
    it('should allow disabling legacy fallback', () => {
      const parserNoFallback = new SkillOutputParser({ enableLegacyParsing: false });
      const legacyOutput = 'Some text output';

      const result = parserNoFallback.parse(legacyOutput);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('JSON parsing failed and legacy parsing disabled')
      );
    });

    it('should allow custom default confidence', () => {
      const parserCustomDefault = new SkillOutputParser({ defaultConfidence: 0.7 });
      const legacyOutput = 'Output without confidence';

      const result = parserCustomDefault.parse(legacyOutput);

      expect(result.output.confidence).toBe(0.7);
    });

    it('should allow strict validation mode', () => {
      const parserStrict = new SkillOutputParser({ strictValidation: true });
      const jsonWithWarnings = JSON.stringify({
        success: true,
        confidence: 0.85,
        deliverables: [],
        metrics: {},
        errors: [],
        extra_field: 'should trigger warning in strict mode',
      });

      const result = parserStrict.parse(jsonWithWarnings);

      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
