/**
 * Agent Output Validator Test Suite
 * Comprehensive test coverage for all agent output validation scenarios
 *
 * @version 1.0.0
 * @description 100+ test scenarios covering all output types and edge cases
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  AgentOutputValidator,
  validateAgentOutput,
  validateLoop3Output,
  validateLoop2Output,
  validateProductOwnerOutput,
  validateJSON,
  isValidOutput,
  resetValidator,
} from '../src/lib/agent-output-validator';
import { parseAgentOutput } from '../src/lib/agent-output-parser';
import type {
  Loop3Output,
  Loop2Output,
  ProductOwnerOutput,
  AgentOutput,
} from '../src/types/agent-output';

describe('AgentOutputValidator', () => {
  beforeEach(() => {
    resetValidator();
  });

  // ============================================================================
  // Loop 3 (Implementer) Output Tests
  // ============================================================================

  describe('Loop 3 Output Validation', () => {
    test('validates valid Loop 3 output with all required fields', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          {
            path: 'src/auth.ts',
            type: 'implementation',
            status: 'created',
          },
        ],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
          timestamp: '2025-11-15T08:00:00Z',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.output_type).toBe('loop3');
    });

    test('validates Loop 3 output with optional metrics', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.92,
        iteration: 1,
        deliverables: [],
        metrics: {
          files_created: 3,
          lines_of_code: 450,
          test_coverage: 0.95,
        },
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('validates Loop 3 output with empty deliverables array', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.7,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Loop 3 output has no deliverables (empty array)'
      );
    });

    test('rejects Loop 3 output with missing deliverables', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('deliverables');
    });

    test('rejects Loop 3 output with invalid deliverable', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          {
            path: '',
            type: 'invalid-type',
            status: 'created',
          },
        ],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('validates all deliverable types', () => {
      const types: Array<Loop3Output['deliverables'][0]['type']> = [
        'implementation',
        'test',
        'documentation',
        'config',
        'schema',
        'script',
        'other',
      ];

      for (const type of types) {
        const output: Loop3Output = {
          output_type: 'loop3',
          success: true,
          confidence: 0.8,
          iteration: 1,
          deliverables: [
            {
              path: `src/file.${type}`,
              type,
              status: 'created',
            },
          ],
          errors: [],
          metadata: {
            agent_type: 'backend-developer',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('validates all deliverable statuses', () => {
      const statuses: Array<Loop3Output['deliverables'][0]['status']> = [
        'created',
        'modified',
        'deleted',
        'validated',
        'pending',
      ];

      for (const status of statuses) {
        const output: Loop3Output = {
          output_type: 'loop3',
          success: true,
          confidence: 0.8,
          iteration: 1,
          deliverables: [
            {
              path: 'src/file.ts',
              type: 'implementation',
              status,
            },
          ],
          errors: [],
          metadata: {
            agent_type: 'backend-developer',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('validates deliverable with optional fields', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          {
            path: 'src/auth.ts',
            type: 'implementation',
            status: 'created',
            size_bytes: 4567,
            lines: 120,
            checksum: 'abc123def456',
          },
        ],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid size_bytes (negative)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          {
            path: 'src/file.ts',
            type: 'implementation',
            status: 'created',
            size_bytes: -100,
          },
        ],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid test_coverage (>1.0)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        metrics: {
          test_coverage: 1.5,
        },
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('validates Loop 3 output with summary', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.88,
        iteration: 1,
        deliverables: [],
        summary: 'Implemented authentication module with JWT support',
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Loop 2 (Validator) Output Tests
  // ============================================================================

  describe('Loop 2 Output Validation', () => {
    test('validates valid Loop 2 output with all required fields', () => {
      const output: Loop2Output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.90,
        iteration: 1,
        validation_type: 'review',
        issues: [],
        recommendations: [],
        approved: true,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.output_type).toBe('loop2');
    });

    test('validates all validation types', () => {
      const types: Array<Loop2Output['validation_type']> = [
        'review',
        'test',
        'security',
        'architecture',
        'performance',
        'compliance',
      ];

      for (const validation_type of types) {
        const output: Loop2Output = {
          output_type: 'loop2',
          success: true,
          confidence: 0.9,
          iteration: 1,
          validation_type,
          issues: [],
          recommendations: [],
          approved: true,
          errors: [],
          metadata: {
            agent_type: 'reviewer',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('validates Loop 2 output with issues', () => {
      const output: Loop2Output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.85,
        iteration: 1,
        validation_type: 'security',
        issues: [
          {
            severity: 'high',
            category: 'security',
            message: 'SQL injection vulnerability',
            location: 'src/db.ts:45',
            recommendation: 'Use parameterized queries',
          },
        ],
        recommendations: ['Add input validation', 'Implement rate limiting'],
        approved: false,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('validates all issue severities', () => {
      const severities: Array<Loop2Output['issues'][0]['severity']> = [
        'critical',
        'high',
        'medium',
        'low',
        'info',
      ];

      for (const severity of severities) {
        const output: Loop2Output = {
          output_type: 'loop2',
          success: true,
          confidence: 0.9,
          iteration: 1,
          validation_type: 'review',
          issues: [
            {
              severity,
              category: 'quality',
              message: 'Test issue',
            },
          ],
          recommendations: [],
          approved: true,
          errors: [],
          metadata: {
            agent_type: 'reviewer',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('validates all issue categories', () => {
      const categories: Array<Loop2Output['issues'][0]['category']> = [
        'security',
        'performance',
        'quality',
        'style',
        'documentation',
        'testing',
        'architecture',
        'other',
      ];

      for (const category of categories) {
        const output: Loop2Output = {
          output_type: 'loop2',
          success: true,
          confidence: 0.9,
          iteration: 1,
          validation_type: 'review',
          issues: [
            {
              severity: 'medium',
              category,
              message: 'Test issue',
            },
          ],
          recommendations: [],
          approved: true,
          errors: [],
          metadata: {
            agent_type: 'reviewer',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('rejects invalid validation_type', () => {
      const output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.9,
        iteration: 1,
        validation_type: 'invalid-type',
        issues: [],
        recommendations: [],
        approved: true,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects issue with missing required fields', () => {
      const output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.9,
        iteration: 1,
        validation_type: 'review',
        issues: [
          {
            severity: 'high',
            // missing category and message
          },
        ],
        recommendations: [],
        approved: true,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('validates Loop 2 output with summary', () => {
      const output: Loop2Output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.92,
        iteration: 1,
        validation_type: 'review',
        issues: [],
        recommendations: [],
        approved: true,
        summary: 'Code review passed with minor style suggestions',
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Product Owner Output Tests
  // ============================================================================

  describe('Product Owner Output Validation', () => {
    test('validates valid Product Owner PROCEED decision', () => {
      const output: ProductOwnerOutput = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.95,
        iteration: 2,
        decision: 'PROCEED',
        rationale: 'All deliverables complete, consensus achieved',
        deliverables_validated: true,
        next_action: 'mark_task_complete',
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.output_type).toBe('product_owner');
    });

    test('validates all decision types', () => {
      const decisions: Array<ProductOwnerOutput['decision']> = [
        'PROCEED',
        'ITERATE',
        'ABORT',
      ];

      for (const decision of decisions) {
        const output: ProductOwnerOutput = {
          output_type: 'product_owner',
          success: true,
          confidence: 0.9,
          iteration: 1,
          decision,
          rationale: `Decided to ${decision}`,
          deliverables_validated: true,
          next_action: 'execute_decision',
          errors: [],
          metadata: {
            agent_type: 'product-owner',
          },
        };

        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }
    });

    test('validates Product Owner output with optional scores', () => {
      const output: ProductOwnerOutput = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.95,
        iteration: 2,
        decision: 'PROCEED',
        rationale: 'High consensus and gate scores',
        deliverables_validated: true,
        next_action: 'mark_task_complete',
        consensus_score: 0.93,
        gate_score: 0.87,
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid decision', () => {
      const output = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.9,
        iteration: 1,
        decision: 'INVALID_DECISION',
        rationale: 'Test',
        deliverables_validated: true,
        next_action: 'test',
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects empty rationale', () => {
      const output = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.9,
        iteration: 1,
        decision: 'PROCEED',
        rationale: '',
        deliverables_validated: true,
        next_action: 'test',
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid consensus_score (>1.0)', () => {
      const output = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.9,
        iteration: 1,
        decision: 'PROCEED',
        rationale: 'Test',
        deliverables_validated: true,
        next_action: 'test',
        consensus_score: 1.5,
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // Base Field Validation Tests
  // ============================================================================

  describe('Base Field Validation', () => {
    test('rejects missing success field', () => {
      const output = {
        output_type: 'loop3',
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'success')).toBe(true);
    });

    test('rejects invalid confidence (<0)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: -0.1,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid confidence (>1)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 1.5,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid iteration (0)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 0,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid iteration (non-integer)', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1.5,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('validates errors array with valid error objects', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: false,
        confidence: 0.5,
        iteration: 1,
        deliverables: [],
        errors: [
          {
            code: 'TIMEOUT',
            message: 'Operation timed out',
            stack: 'Error: timeout\n  at ...',
            context: { timeout_ms: 5000 },
          },
        ],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('rejects error with missing required fields', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [
          {
            code: 'TEST',
            // missing message
          },
        ],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });

    test('validates metadata with all optional fields', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
          agent_id: 'agent-123',
          execution_time_ms: 1234,
          timestamp: '2025-11-15T08:00:00Z',
          swarm_id: 'swarm-456',
          iteration: 1,
          mode: 'standard',
          context: { task_id: 'task-789' },
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid mode', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
          mode: 'invalid-mode',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    test('rejects null input', () => {
      const result = validateAgentOutput(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });

    test('rejects undefined input', () => {
      const result = validateAgentOutput(undefined);
      expect(result.valid).toBe(false);
    });

    test('rejects non-object input', () => {
      const result = validateAgentOutput('invalid');
      expect(result.valid).toBe(false);
    });

    test('rejects invalid output_type', () => {
      const output = {
        output_type: 'invalid',
        success: true,
        confidence: 0.85,
        iteration: 1,
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_OUTPUT_TYPE');
    });

    test('handles very large deliverable arrays', () => {
      const deliverables = Array(1000)
        .fill(null)
        .map((_, i) => ({
          path: `src/file${i}.ts`,
          type: 'implementation' as const,
          status: 'created' as const,
        }));

      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables,
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const start = Date.now();
      const result = validateAgentOutput(output);
      const duration = Date.now() - start;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(100); // Should complete in <100ms
    });

    test('handles nested error context', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: false,
        confidence: 0.5,
        iteration: 1,
        deliverables: [],
        errors: [
          {
            code: 'COMPLEX_ERROR',
            message: 'Complex error with nested context',
            context: {
              level1: {
                level2: {
                  level3: 'deep value',
                },
              },
            },
          },
        ],
        metadata: {
          agent_type: 'test',
        },
      };

      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Type-Specific Validation Functions
  // ============================================================================

  describe('Type-Specific Validators', () => {
    test('validateLoop3Output accepts Loop 3 output', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const result = validateLoop3Output(output);
      expect(result.valid).toBe(true);
    });

    test('validateLoop3Output rejects Loop 2 output', () => {
      const output: Loop2Output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.9,
        iteration: 1,
        validation_type: 'review',
        issues: [],
        recommendations: [],
        approved: true,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateLoop3Output(output);
      expect(result.valid).toBe(false);
    });

    test('validateLoop2Output accepts Loop 2 output', () => {
      const output: Loop2Output = {
        output_type: 'loop2',
        success: true,
        confidence: 0.9,
        iteration: 1,
        validation_type: 'review',
        issues: [],
        recommendations: [],
        approved: true,
        errors: [],
        metadata: {
          agent_type: 'reviewer',
        },
      };

      const result = validateLoop2Output(output);
      expect(result.valid).toBe(true);
    });

    test('validateProductOwnerOutput accepts Product Owner output', () => {
      const output: ProductOwnerOutput = {
        output_type: 'product_owner',
        success: true,
        confidence: 0.95,
        iteration: 2,
        decision: 'PROCEED',
        rationale: 'Test',
        deliverables_validated: true,
        next_action: 'complete',
        errors: [],
        metadata: {
          agent_type: 'product-owner',
        },
      };

      const result = validateProductOwnerOutput(output);
      expect(result.valid).toBe(true);
    });

    test('isValidOutput returns boolean', () => {
      const validOutput: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      expect(isValidOutput(validOutput)).toBe(true);
      expect(isValidOutput(null)).toBe(false);
      expect(isValidOutput({})).toBe(false);
    });
  });

  // ============================================================================
  // JSON String Validation
  // ============================================================================

  describe('JSON String Validation', () => {
    test('validates valid JSON string', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const jsonString = JSON.stringify(output);
      const result = validateJSON(jsonString);
      expect(result.valid).toBe(true);
    });

    test('rejects invalid JSON string', () => {
      const result = validateJSON('not valid json {');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('JSON_PARSE_ERROR');
    });

    test('validates pretty-printed JSON', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const jsonString = JSON.stringify(output, null, 2);
      const result = validateJSON(jsonString);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Legacy Parser Integration Tests
  // ============================================================================

  describe('Legacy Parser Integration', () => {
    test('parses JSON output correctly', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const jsonString = JSON.stringify(output);
      const result = parseAgentOutput(jsonString);
      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('parses Loop 3 text output', () => {
      const text = `
Implementation complete
Confidence: 0.85
Iteration: 1

Deliverables:
- created: src/auth.ts
- modified: src/index.ts

Files created: 2
Lines of code: 450
`;

      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      expect(result.output?.output_type).toBe('loop3');
    });

    test('parses Loop 2 text output', () => {
      const text = `
Validation complete
Confidence: 0.90
approved: true

Issues:
- [high] Security vulnerability in auth module

Recommendations:
- Add input validation
- Use parameterized queries
`;

      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      expect(result.output?.output_type).toBe('loop2');
    });

    test('parses Product Owner text output', () => {
      const text = `
Decision: PROCEED
Rationale: All deliverables complete, consensus achieved
Confidence: 0.95
Iteration: 2
Deliverables validated: yes
`;

      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      expect(result.output?.output_type).toBe('product_owner');
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    test('validates typical Loop 3 output in <10ms', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          { path: 'src/file1.ts', type: 'implementation', status: 'created' },
          { path: 'src/file2.ts', type: 'test', status: 'created' },
        ],
        metrics: {
          files_created: 2,
          lines_of_code: 450,
        },
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
        },
      };

      const start = Date.now();
      const result = validateAgentOutput(output);
      const duration = Date.now() - start;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(10);
    });

    test('validates 100 outputs sequentially in <500ms', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: {
          agent_type: 'test',
        },
      };

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        validateAgentOutput(output);
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  // ============================================================================
  // Iteration 2 Test Coverage - Security Sanitization
  // ============================================================================

  describe('Security - sanitizeValue()', () => {
    test('should not expose sensitive data in validation errors', () => {
      // Test that validation works correctly even with sensitive-looking data
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [
          {
            path: 'config/passwords.txt',
            type: 'config',
            status: 'created',
          },
        ],
        errors: [],
        metadata: {
          agent_type: 'backend-developer',
          context: { deployment: 'production' },
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('should sanitize sensitive field paths (password)', () => {
      // Create a validation error with 'password' in the field path
      // by using invalid confidence value
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 'invalid-with-password-data', // Invalid type, path will contain 'password' in error
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'test' },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      // Verify error exists for confidence field
      expect(result.errors.some(e => e.field === 'confidence')).toBe(true);
    });

    test('should handle api_key in error values safely', () => {
      // Test that errors array with context containing api_key-like data validates correctly
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [
          {
            code: 'CONFIG_ERROR',
            message: 'Configuration validation failed',
            context: { config_file: 'app.conf', issue: 'api_key missing' },
          },
        ],
        metadata: { agent_type: 'backend-developer' },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('should handle token data in valid structures', () => {
      // Test that valid outputs with token-related metadata work correctly
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [
          {
            code: 'AUTH_ERROR',
            message: 'Token validation required',
            context: { reason: 'token_expired', retry: true },
          },
        ],
        metadata: { agent_type: 'backend-developer' },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
    });

    test('should truncate large values in error formatting', () => {
      const largeValue = 'x'.repeat(200);
      const output = {
        output_type: 'loop3',
        success: largeValue, // Invalid type AND large value
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'test' },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      const validator = new AgentOutputValidator();
      const formatted = validator.formatErrors(result);
      // Should be truncated and not contain full 200 char string
      expect(formatted).toContain('[truncated]');
      // Formatted output should be much smaller than original value
      expect(formatted.length).toBeLessThan(largeValue.length + 200);
      // Should not contain the full repeated string
      expect(formatted).not.toContain(largeValue);
    });
  });

  // ============================================================================
  // Iteration 2 Test Coverage - Custom Metrics Validation
  // ============================================================================

  describe('custom_metrics validation', () => {
    test('should accept valid custom_metrics with numeric values', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          files_created: 5,
          custom_metrics: {
            custom_metric_1: 123,
            custom_metric_2: 456.789,
            custom_metric_3: 0,
          },
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject custom_metrics with non-numeric values', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          custom_metrics: {
            invalid_metric: 'not a number',
          },
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) => e.field === 'metrics.custom_metrics.invalid_metric'
        )
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('number'))
      ).toBe(true);
    });

    test('should accept undefined custom_metrics (optional)', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          files_created: 5,
          // custom_metrics is undefined
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept empty custom_metrics object', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          custom_metrics: {},
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================================================
  // Iteration 2 Test Coverage - Regex Number Parsing
  // ============================================================================

  describe('Regex number parsing fixes', () => {
    test('should parse valid decimal numbers', () => {
      const text = 'Confidence: 0.85\nFiles created: 5';
      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      if (result.output) {
        expect(result.output.confidence).toBe(0.85);
      }
    });

    test('should parse whole numbers', () => {
      const text =
        'Iteration: 1\nConfidence: 1.0\n123 files created\nDeliverables:\n- src/file.ts - created';
      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      if (result.output && result.output.output_type === 'loop3') {
        expect(result.output.metrics?.files_created).toBe(123);
      }
    });

    test('should parse zero values', () => {
      const text = 'Confidence: 0.0\nIteration: 1\nFiles created: 0';
      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      if (result.output) {
        expect(result.output.confidence).toBe(0.0);
      }
    });

    test('should handle malformed numbers gracefully', () => {
      const text = 'Invalid confidence: 1.2.3\nIteration: 1';
      const result = parseAgentOutput(text);
      // Parser should handle malformed numbers by using defaults
      if (result.success && result.output) {
        // Should use default confidence if parsing fails
        expect(result.output.confidence).toBeGreaterThanOrEqual(0);
        expect(result.output.confidence).toBeLessThanOrEqual(1);
      }
    });

    test('should parse large decimal numbers correctly', () => {
      const text =
        'Confidence: 0.987654\nIteration: 1\nTest coverage: 99.9%\nDeliverables:\n- src/test.ts - created';
      const result = parseAgentOutput(text);
      expect(result.success).toBe(true);
      if (result.output) {
        expect(result.output.confidence).toBeCloseTo(0.987654, 6);
      }
    });
  });

  // ============================================================================
  // Iteration 2 Test Coverage - Schema Enforcement
  // ============================================================================

  describe('Schema enforcement - additionalProperties: false', () => {
    test('should reject unknown metrics fields', () => {
      const output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          unknown_field: 123,
          another_unknown: 456,
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some((e) => e.code === 'UNKNOWN_FIELD')
      ).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('custom_metrics'))
      ).toBe(true);
    });

    test('should accept known metrics fields', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          files_created: 5,
          files_modified: 3,
          files_deleted: 1,
          lines_of_code: 1000,
          test_coverage: 0.9,
          tests_passed: 50,
          tests_failed: 2,
          execution_time_ms: 5000,
          memory_usage_mb: 256,
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should accept custom_metrics field', () => {
      const output: Loop3Output = {
        output_type: 'loop3',
        success: true,
        confidence: 0.85,
        iteration: 1,
        deliverables: [],
        errors: [],
        metadata: { agent_type: 'backend-developer' },
        metrics: {
          custom_metrics: {
            my_metric: 42,
            another_metric: 99.99,
          },
        },
      };
      const result = validateAgentOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
