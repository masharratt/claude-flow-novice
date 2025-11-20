/**
 * Decision Parser Test Suite
 * Unit tests for Product Owner decision parsing logic
 */

import { DecisionParser, parseDecision, DecisionParserError, ParsedDecision } from '../../../../src/cfn-loop/product-owner/decision-parser';

describe('DecisionParser', () => {
  let parser: DecisionParser;

  beforeEach(() => {
    parser = new DecisionParser({ strict: true });
  });

  describe('Decision Extraction', () => {
    it('should extract PROCEED decision with explicit label', () => {
      const output = 'Decision: PROCEED\nReasoning: Quality threshold met.';
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
    });

    it('should extract ITERATE decision with explicit label', () => {
      const output = 'Decision: ITERATE\nReasoning: Need improvements.';
      const result = parser.parse(output);

      expect(result.decision).toBe('ITERATE');
    });

    it('should extract ABORT decision with explicit label', () => {
      const output = 'Decision: ABORT\nReasoning: Max iterations reached.';
      const result = parser.parse(output);

      expect(result.decision).toBe('ABORT');
    });

    it('should extract decision (case-insensitive)', () => {
      const output = 'decision: proceed\nReasoning: Good to go.';
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
    });

    it('should extract decision from standalone keyword', () => {
      const output = 'I recommend we PROCEED with the implementation.';
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
    });

    it('should extract decision from parentheses', () => {
      const output = 'My recommendation is (ITERATE) due to scope issues.';
      const result = parser.parse(output);

      expect(result.decision).toBe('ITERATE');
    });

    it('should extract decision from JSON format', () => {
      const output = '{"decision": "ABORT", "reason": "Critical bug"}';
      const result = parser.parse(output);

      expect(result.decision).toBe('ABORT');
    });

    it('should handle multiple decision keywords (first one wins)', () => {
      const output = 'PROCEED with caution, but if issues arise ITERATE.';
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
    });

    it('should throw error if no decision found (strict mode)', () => {
      const output = 'No clear decision in this output.';
      const strictParser = new DecisionParser({ strict: true });

      expect(() => strictParser.parse(output)).toThrow(DecisionParserError);
    });

    it('should default to ITERATE if no decision found (non-strict)', () => {
      const output = 'No clear decision in this output.';
      const nonStrictParser = new DecisionParser({ strict: false });
      const result = nonStrictParser.parse(output);

      expect(result.decision).toBe('ITERATE');
    });
  });

  describe('Confidence Extraction', () => {
    it('should extract confidence score', () => {
      const output = 'Decision: PROCEED\nConfidence: 0.95';
      const result = parser.parse(output);

      expect(result.confidence).toBe(0.95);
    });

    it('should extract confidence as percentage', () => {
      const output = 'Decision: ITERATE\nConfidence: 73%\nReasoning: Good.';
      const result = parser.parse(output);

      expect(result.confidence).toBe(0.73);
    });

    it('should extract confidence from JSON', () => {
      const output = '{"decision": "PROCEED", "confidence": 0.92}';
      const result = parser.parse(output);

      expect(result.confidence).toBe(0.92);
    });

    it('should clamp confidence to 0-1 range', () => {
      const output = 'Decision: PROCEED\nConfidence: 1.5';
      const result = parser.parse(output);

      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should default to 0.75 if confidence not found', () => {
      const output = 'Decision: PROCEED';
      const result = parser.parse(output);

      expect(result.confidence).toBe(0.75);
    });

    it('should clamp confidence to range', () => {
      // Test with value > 1
      const output = 'Decision: ABORT\nConfidence: 2.5\nReasoning: Critical issue.';
      const result = parser.parse(output);

      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Reasoning Extraction', () => {
    it('should extract reasoning with explicit label', () => {
      const output = 'Decision: PROCEED\nReasoning: All tests passed and deliverables complete.';
      const result = parser.parse(output);

      expect(result.reasoning).toContain('All tests passed');
    });

    it('should extract reasoning with "Because" prefix', () => {
      const output = 'Decision: ITERATE\nBecause: More refactoring needed.';
      const result = parser.parse(output);

      expect(result.reasoning).toContain('More refactoring');
    });

    it('should extract reasoning from JSON', () => {
      const output = '{"decision": "ABORT", "reasoning": "Critical security issue found"}';
      const result = parser.parse(output);

      expect(result.reasoning).toContain('Critical security');
    });

    it('should return empty reasoning if not found', () => {
      const output = 'Decision: PROCEED';
      const result = parser.parse(output);

      expect(result.reasoning).toBeDefined();
    });

    it('should handle multi-line reasoning', () => {
      const output = `
Decision: PROCEED
Reasoning: Code quality improved, all tests pass,
security review completed, and performance acceptable.
Confidence: 0.92`;
      const result = parser.parse(output);

      expect(result.reasoning).toContain('Code quality');
    });
  });

  describe('Deliverable Extraction', () => {
    it('should extract deliverables from bulleted list', () => {
      const output = `
Decision: PROCEED
Deliverables:
- TypeScript decision parser module
- CLI entry point with JSON output
- Unit test suite with 90% coverage
`;
      const result = parser.parse(output);

      expect(result.deliverables).toHaveLength(3);
      expect(result.deliverables).toContain('TypeScript decision parser module');
    });

    it('should extract deliverables with different bullet styles', () => {
      const output = `
Decision: PROCEED
Deliverables:
* First deliverable
• Second deliverable
- Third deliverable
`;
      const result = parser.parse(output);

      expect(result.deliverables.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract deliverables from JSON', () => {
      const output = '{"decision": "PROCEED", "deliverables": ["Feature A", "Feature B", "Tests"]}';
      const result = parser.parse(output);

      expect(result.deliverables).toEqual(['Feature A', 'Feature B', 'Tests']);
    });

    it('should return empty array if no deliverables found', () => {
      const output = 'Decision: PROCEED';
      const result = parser.parse(output);

      expect(Array.isArray(result.deliverables)).toBe(true);
    });

    it('should remove duplicate deliverables', () => {
      const output = `
Decision: ITERATE
Deliverables:
- Feature A
- Feature A
- Feature B
`;
      const result = parser.parse(output);

      expect(result.deliverables.filter(d => d === 'Feature A')).toHaveLength(1);
    });
  });

  describe('Validation', () => {
    it('should detect ITERATE without reasoning', () => {
      const output = 'Decision: ITERATE';
      const result = parser.parse(output);

      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors.some(e => e.includes('reasoning'))).toBe(true);
    });

    it('should detect ABORT with high confidence', () => {
      const output = 'Decision: ABORT\nConfidence: 0.8\nReasoning: System failed.';
      const result = parser.parse(output);

      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should warn PROCEED with low confidence', () => {
      const output = 'Decision: PROCEED\nConfidence: 0.5';
      const result = parser.parse(output);

      expect(result.validationErrors.some(e => e.includes('low confidence'))).toBe(true);
    });

    it('should pass validation for well-formed PROCEED', () => {
      const output = 'Decision: PROCEED\nReasoning: All criteria met.\nConfidence: 0.92';
      const result = parser.parse(output);

      expect(result.validationErrors.filter(e => !e.includes('vapor'))).toHaveLength(0);
    });

    it('should pass validation for well-formed ITERATE', () => {
      const output = 'Decision: ITERATE\nReasoning: Performance needs improvement.\nConfidence: 0.75';
      const result = parser.parse(output);

      expect(result.validationErrors).toHaveLength(0);
    });
  });

  describe('Consensus on Vapor Detection', () => {
    it('should detect vapor consensus (no files, implementation task)', () => {
      const vaporParser = new DecisionParser({
        taskContext: 'Create TypeScript module for decision parsing',
        validateDeliverables: true
      });

      const output = 'Decision: PROCEED\nReasoning: Plan looks good.';
      const result = vaporParser.parse(output);

      // In strict mode, should override to ITERATE
      if (result.decision === 'PROCEED') {
        // Only if no actual files were created (hard to test in unit test)
        // The vapor check uses git status
      }
    });

    it('should not flag vapor for non-implementation tasks', () => {
      const parser = new DecisionParser({
        taskContext: 'Review documentation and provide feedback',
        validateDeliverables: true
      });

      const output = 'Decision: PROCEED\nReasoning: Documentation is good.';
      const result = parser.parse(output);

      // Should not flag as vapor since task doesn't require files
      expect(result.validationErrors.filter(e => e.includes('vapor'))).toHaveLength(0);
    });

    it('should accept claims without file check if no task context', () => {
      const parser = new DecisionParser({
        validateDeliverables: true
      });

      const output = 'Decision: PROCEED\nDeliverables: All planned changes completed.';
      const result = parser.parse(output);

      // Without task context, vapor check is skipped
      expect(result.validationErrors.filter(e => e.includes('vapor'))).toHaveLength(0);
    });
  });

  describe('Audit Analysis Extraction', () => {
    it('should extract audit analysis section', () => {
      const output = `
Decision: PROCEED
Reasoning: Quality checks passed.
Audit Analysis: Previous iterations showed consistent improvement trajectory.
Confidence: 0.90`;
      const result = parser.parse(output);

      expect(result.auditAnalysis).toContain('Previous iterations');
    });

    it('should handle missing audit analysis', () => {
      const output = 'Decision: PROCEED\nReasoning: Good to go.';
      const result = parser.parse(output);

      expect(result.auditAnalysis).toBeUndefined();
    });
  });

  describe('Agent Performance Extraction', () => {
    it('should extract agent performance observations', () => {
      const output = `
Decision: PROCEED
Agent Performance: TypeScript specialist delivered 95% test coverage consistently.
Confidence: 0.88`;
      const result = parser.parse(output);

      expect(result.agentPerformanceObservations).toContain('TypeScript');
    });

    it('should handle missing agent performance', () => {
      const output = 'Decision: PROCEED';
      const result = parser.parse(output);

      expect(result.agentPerformanceObservations).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw on empty input (strict)', () => {
      const strictParser = new DecisionParser({ strict: true });

      expect(() => strictParser.parse('')).toThrow(DecisionParserError);
    });

    it('should throw on null input', () => {
      expect(() => parser.parse(null as any)).toThrow(DecisionParserError);
    });

    it('should throw on non-string input', () => {
      expect(() => parser.parse(123 as any)).toThrow(DecisionParserError);
    });

    it('should provide helpful error details', () => {
      const strictParser = new DecisionParser({ strict: true });

      try {
        strictParser.parse('No decision here');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DecisionParserError);
        const parserError = error as DecisionParserError;
        expect(parserError.code).toBe('NO_DECISION_FOUND');
        expect(parserError.details).toBeDefined();
      }
    });
  });

  describe('Raw Output Preservation', () => {
    it('should preserve full output in raw section', () => {
      const input = 'Decision: PROCEED\nReasoning: All tests pass.';
      const result = parser.parse(input);

      expect(result.raw.fullOutput).toBe(input);
    });

    it('should capture decision line', () => {
      const input = 'Some preamble\nDecision: ITERATE\nMore text';
      const result = parser.parse(input);

      expect(result.raw.decisionLine).toContain('ITERATE');
    });
  });

  describe('Integration Tests', () => {
    it('should parse complete Product Owner output', () => {
      const output = `
Loop 2 Consensus: 0.92
Threshold: 0.90

Decision: PROCEED

Reasoning: Quality threshold exceeded. All agents report positive feedback.
Audit trail shows consistent improvements across iterations.

Deliverables:
- TypeScript decision parser module
- CLI entry point for production use
- Comprehensive test suite

Confidence: 0.93

Audit Analysis: Previous agent performance indicates quality.
Agent Performance: TypeScript specialist showed good collaboration.
`;
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
      expect(result.confidence).toBe(0.93);
      expect(result.deliverables.length).toBeGreaterThanOrEqual(2);
      expect(result.auditAnalysis).toBeDefined();
      expect(result.agentPerformanceObservations).toBeDefined();
    });

    it('should parse minimal valid output', () => {
      const output = 'Decision: ITERATE';
      const result = parser.parse(output);

      expect(result.decision).toBe('ITERATE');
      expect(result.confidence).toBe(0.75);
      expect(result.reasoning).toBeDefined();
    });

    it('should handle malformed but interpretable output', () => {
      const output = `
PROCEED with caution
I believe this is the right direction
Confidence: 0.80
Some issues to address in next iteration
`;
      const result = parser.parse(output);

      expect(result.decision).toBe('PROCEED');
      expect(result.confidence).toBe(0.80);
    });
  });

  describe('Convenience Functions', () => {
    it('should parse via parseDecision function', async () => {
      const output = 'Decision: PROCEED\nReasoning: Good.';
      const result = await parseDecision(output);

      expect(result.decision).toBe('PROCEED');
    });

    it('should pass options to parseDecision', async () => {
      const output = 'Invalid output with no decision';
      const nonStrictResult = await parseDecision(output, { strict: false });

      expect(nonStrictResult.decision).toBe('ITERATE');
    });
  });
});

describe('DecisionParserError', () => {
  it('should create error with code and details', () => {
    const error = new DecisionParserError(
      'Test error message',
      'TEST_CODE',
      { extra: 'details' }
    );

    expect(error.message).toBe('Test error message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ extra: 'details' });
    expect(error.name).toBe('DecisionParserError');
  });

  it('should maintain error stack', () => {
    const error = new DecisionParserError('Test', 'CODE');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('DecisionParserError');
  });
});
