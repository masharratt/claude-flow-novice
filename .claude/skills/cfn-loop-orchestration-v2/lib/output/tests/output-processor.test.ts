/**
 * Comprehensive tests for unified output processing module
 * Tests confidence extraction, feedback parsing, and consensus calculation
 */

import {
  parseConfidence,
  extractFeedback,
  extractRecommendations,
  calculateFallbackConfidence,
  isValidConfidence,
  parseLoop3Output,
  parseLoop2Output,
  calculateConsensus,
  isDefaultOutput,
  formatAsJson,
  parseJson,
  Loop2Result,
} from '../src/output-processor';

describe('Output Processing Module', () => {
  describe('parseConfidence', () => {
    it('should extract explicit confidence (0.XX format)', () => {
      const output = 'Confidence: 0.85';
      const result = parseConfidence(output);
      expect(result.score).toBe(0.85);
      expect(result.source).toBe('explicit');
    });

    it('should extract confidence with different labels', () => {
      expect(parseConfidence('confidence: 0.92').score).toBe(0.92);
      expect(parseConfidence('Score: 0.78').score).toBe(0.78);
      expect(parseConfidence('Validation Confidence: 0.88').score).toBe(0.88);
    });

    it('should convert percentage to decimal', () => {
      const result = parseConfidence('I am 85% confident');
      expect(result.score).toBeCloseTo(0.85, 2);
      expect(result.source).toBe('explicit');
    });

    it('should handle percentage > 100', () => {
      const result = parseConfidence('Pass rate: 150%');
      expect(result.score).toBeCloseTo(1.5, 2);
    });

    it('should extract confidence from parentheses', () => {
      const result = parseConfidence('Quality assessment (0.75)');
      expect(result.score).toBe(0.75);
      expect(result.source).toBe('explicit');
    });

    it('should map qualitative confidence', () => {
      expect(parseConfidence('high confidence').score).toBe(0.9);
      expect(parseConfidence('medium confidence').score).toBe(0.75);
      expect(parseConfidence('low confidence').score).toBe(0.5);
      expect(parseConfidence('excellent').score).toBe(0.95);
    });

    it('should return 0.0 for missing confidence', () => {
      const result = parseConfidence('No confidence information provided');
      expect(result.score).toBe(0.0);
      expect(result.source).toBe('none');
    });

    it('should handle empty input', () => {
      expect(parseConfidence('').score).toBe(0.0);
      expect(parseConfidence('   ').score).toBe(0.0);
    });

    it('should handle case-insensitive matching', () => {
      expect(parseConfidence('CONFIDENCE: 0.80').score).toBe(0.80);
      expect(parseConfidence('High Confidence').score).toBe(0.9);
    });
  });

  describe('extractFeedback', () => {
    it('should extract categorized feedback from sections', () => {
      const output = `
### CRITICAL Issues
- Missing error handling
- SQL injection vulnerability

### WARNING Issues
- Performance issue in loop

### SUGGESTION Items
- Add documentation
`;
      const feedback = extractFeedback(output);
      expect(feedback).toHaveLength(4);
      expect(feedback.filter((f) => f.severity === 'CRITICAL')).toHaveLength(2);
      expect(feedback.filter((f) => f.severity === 'WARNING')).toHaveLength(1);
      expect(feedback.filter((f) => f.severity === 'SUGGESTION')).toHaveLength(
        1
      );
    });

    it('should handle different bullet point styles', () => {
      const output = `
### CRITICAL Issues
- First issue
* Second issue
• Third issue
`;
      const feedback = extractFeedback(output);
      expect(feedback).toHaveLength(3);
    });

    it('should extract inline format feedback', () => {
      const output = `
CRITICAL: Missing authentication
WARNING: Code duplication
SUGGESTION: Add comments
`;
      const feedback = extractFeedback(output);
      expect(feedback.length).toBeGreaterThan(0);
    });

    it('should ignore "No issues found" entries', () => {
      const output = `
### CRITICAL Issues
- No issues found

### WARNING Issues
- Potential memory leak
`;
      const feedback = extractFeedback(output);
      expect(feedback.filter((f) => f.text === 'No issues found')).toHaveLength(
        0
      );
    });

    it('should return empty array for no feedback', () => {
      const feedback = extractFeedback('No feedback provided');
      expect(feedback).toEqual([]);
    });
  });

  describe('extractRecommendations', () => {
    it('should extract recommendations from section', () => {
      const output = `
Recommendations:
- Add unit tests
- Refactor complex methods
- Improve error messages
`;
      const recs = extractRecommendations(output);
      expect(recs).toHaveLength(3);
      expect(recs[0]).toContain('Add unit tests');
    });

    it('should handle singular "Recommendation"', () => {
      const output = `
Recommendation:
- Simplify the API
`;
      const recs = extractRecommendations(output);
      expect(recs.length).toBeGreaterThan(0);
    });

    it('should handle "Suggestions"', () => {
      const output = `
Suggestions:
- Use const instead of let
`;
      const recs = extractRecommendations(output);
      expect(recs.length).toBeGreaterThan(0);
    });

    it('should return empty array for no recommendations', () => {
      const recs = extractRecommendations('No recommendations');
      expect(recs).toEqual([]);
    });
  });

  describe('calculateFallbackConfidence', () => {
    it('should return 0.0 for no files changed', () => {
      expect(calculateFallbackConfidence(0)).toBe(0.0);
    });

    it('should return 0.5 for minimal changes (1-2 files)', () => {
      expect(calculateFallbackConfidence(1)).toBe(0.5);
      expect(calculateFallbackConfidence(2)).toBe(0.5);
    });

    it('should return 0.75 for moderate changes (3-5 files)', () => {
      expect(calculateFallbackConfidence(3)).toBe(0.75);
      expect(calculateFallbackConfidence(5)).toBe(0.75);
    });

    it('should return 0.85 for significant changes (6+ files)', () => {
      expect(calculateFallbackConfidence(6)).toBe(0.85);
      expect(calculateFallbackConfidence(10)).toBe(0.85);
    });

    it('should boost confidence with passing tests', () => {
      const conf = calculateFallbackConfidence(6, [], {
        passed: 10,
        failed: 0,
      });
      expect(conf).toBe(0.95);
    });

    it('should handle 90% test pass rate', () => {
      const conf = calculateFallbackConfidence(6, [], {
        passed: 9,
        failed: 1,
      });
      expect(conf).toBe(0.9);
    });

    it('should handle 80% test pass rate', () => {
      const conf = calculateFallbackConfidence(6, [], {
        passed: 8,
        failed: 2,
      });
      expect(conf).toBe(0.85);
    });
  });

  describe('isValidConfidence', () => {
    it('should validate correct range (0.0-1.0)', () => {
      expect(isValidConfidence(0.0)).toBe(true);
      expect(isValidConfidence(0.5)).toBe(true);
      expect(isValidConfidence(1.0)).toBe(true);
    });

    it('should reject out of range values', () => {
      expect(isValidConfidence(-0.1)).toBe(false);
      expect(isValidConfidence(1.1)).toBe(false);
    });

    it('should reject NaN', () => {
      expect(isValidConfidence(NaN)).toBe(false);
    });

    it('should handle custom range', () => {
      expect(isValidConfidence(0.5, 0.0, 0.8)).toBe(true);
      expect(isValidConfidence(0.9, 0.0, 0.8)).toBe(false);
    });
  });

  describe('parseLoop3Output', () => {
    it('should parse complete Loop 3 output', () => {
      const output = `
Implemented authentication module successfully.
Confidence: 0.85
Files created: 5
Tests passing: 100%
`;
      const result = parseLoop3Output(output, 'coder-1', 1);

      expect(result.agentId).toBe('coder-1');
      expect(result.confidence).toBe(0.85);
      expect(result.confidenceSource).toBe('explicit');
      expect(result.iteration).toBe(1);
      expect(result.timestamp).toBeTruthy();
    });

    it('should use fallback confidence when explicit is missing', () => {
      const output = 'Implemented 5 new files';
      const result = parseLoop3Output(output, 'coder-2', 1);

      expect(result.confidence).toBe(0.75); // fallback for 5 files
      expect(result.confidenceSource).toBe('calculated');
    });

    it('should calculate confidence from test results', () => {
      const output = `
Implementation complete
Tests passed: 20
Tests failed: 0
`;
      const result = parseLoop3Output(output, 'coder-3', 1);

      expect(result.testsPassedCount).toBe(20);
      expect(result.testsFailed).toBe(0);
    });

    it('should parse deliverables from git status', () => {
      const gitStatus = {
        before: 'M src/file1.ts\n',
        after: 'M src/file1.ts\nA src/file2.ts\nA src/file3.ts\n',
      };
      const result = parseLoop3Output('Output', 'coder-4', 1, gitStatus);

      expect(result.filesChanged).toBe(2); // 2 new files
      expect(result.deliverables.length).toBe(2);
    });
  });

  describe('parseLoop2Output', () => {
    it('should parse complete validator output', () => {
      const output = `
## Validation Confidence: 0.92

### CRITICAL Issues
- None

### WARNING Issues
- Performance could be improved

### SUGGESTION Items
- Add more unit tests

Recommendations:
- Increase code coverage
`;
      const result = parseLoop2Output(output, 'reviewer-1', 1);

      expect(result.validatorId).toBe('reviewer-1');
      expect(result.score).toBe(0.92);
      expect(result.criticalCount).toBe(0);
      expect(result.warningCount).toBe(1);
      expect(result.suggestionCount).toBe(1);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should count feedback by severity', () => {
      const output = `
Confidence: 0.75

### CRITICAL Issues
- Issue 1
- Issue 2

### WARNING Issues
- Warning 1
- Warning 2
- Warning 3
`;
      const result = parseLoop2Output(output, 'reviewer-2', 1);

      expect(result.criticalCount).toBe(2);
      expect(result.warningCount).toBe(3);
      expect(result.suggestionCount).toBe(0);
    });

    it('should handle invalid confidence gracefully', () => {
      const output = 'Some validation feedback';
      const result = parseLoop2Output(output, 'reviewer-3', 1);

      expect(result.score).toBe(0.0);
      expect(result.scoreSource).toBe('calculated');
    });
  });

  describe('calculateConsensus', () => {
    it('should calculate average score from multiple validators', () => {
      const results: Loop2Result[] = [
        {
          validatorId: 'v1',
          score: 0.9,
          scoreSource: 'explicit',
          issues: [],
          criticalCount: 0,
          warningCount: 0,
          suggestionCount: 0,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
        {
          validatorId: 'v2',
          score: 0.8,
          scoreSource: 'explicit',
          issues: [],
          criticalCount: 0,
          warningCount: 1,
          suggestionCount: 0,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
      ];

      const consensus = calculateConsensus(results, 0.75);

      expect(consensus.averageScore).toBe(0.85);
      expect(consensus.minScore).toBe(0.8);
      expect(consensus.maxScore).toBe(0.9);
      expect(consensus.passed).toBe(true);
      expect(consensus.validatorCount).toBe(2);
      expect(consensus.scoredCount).toBe(2);
    });

    it('should fail consensus when below threshold', () => {
      const results: Loop2Result[] = [
        {
          validatorId: 'v1',
          score: 0.6,
          scoreSource: 'explicit',
          issues: [],
          criticalCount: 2,
          warningCount: 0,
          suggestionCount: 0,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
      ];

      const consensus = calculateConsensus(results, 0.75);

      expect(consensus.passed).toBe(false);
      expect(consensus.summary).toContain('FAIL');
    });

    it('should aggregate critical issues', () => {
      const results: Loop2Result[] = [
        {
          validatorId: 'v1',
          score: 0.8,
          scoreSource: 'explicit',
          issues: [],
          criticalCount: 2,
          warningCount: 1,
          suggestionCount: 0,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
        {
          validatorId: 'v2',
          score: 0.85,
          scoreSource: 'explicit',
          issues: [],
          criticalCount: 1,
          warningCount: 0,
          suggestionCount: 2,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
      ];

      const consensus = calculateConsensus(results);

      expect(consensus.details.criticalIssuesTotal).toBe(3);
      expect(consensus.details.warningIssuesTotal).toBe(1);
      expect(consensus.details.suggestionsTotal).toBe(2);
    });

    it('should handle empty results', () => {
      const consensus = calculateConsensus([]);

      expect(consensus.averageScore).toBe(0.0);
      expect(consensus.passed).toBe(false);
      expect(consensus.validatorCount).toBe(0);
    });

    it('should handle all invalid scores', () => {
      const results: Loop2Result[] = [
        {
          validatorId: 'v1',
          score: NaN,
          scoreSource: 'calculated',
          issues: [],
          criticalCount: 0,
          warningCount: 0,
          suggestionCount: 0,
          recommendations: [],
          output: '',
          iteration: 1,
          timestamp: new Date().toISOString(),
        },
      ];

      const consensus = calculateConsensus(results);

      expect(consensus.scoredCount).toBe(0);
      expect(consensus.passed).toBe(false);
    });
  });

  describe('isDefaultOutput', () => {
    it('should detect default validator output', () => {
      const result: Loop2Result = {
        validatorId: 'v1',
        score: 0.7,
        scoreSource: 'explicit',
        issues: [],
        criticalCount: 0,
        warningCount: 0,
        suggestionCount: 0,
        recommendations: [],
        output: '',
        iteration: 1,
        timestamp: new Date().toISOString(),
      };

      expect(isDefaultOutput(result)).toBe(true);
    });

    it('should reject output with actual feedback', () => {
      const result: Loop2Result = {
        validatorId: 'v1',
        score: 0.7,
        scoreSource: 'explicit',
        issues: [{ severity: 'WARNING', text: 'Issue found' }],
        criticalCount: 0,
        warningCount: 1,
        suggestionCount: 0,
        recommendations: [],
        output: '',
        iteration: 1,
        timestamp: new Date().toISOString(),
      };

      expect(isDefaultOutput(result)).toBe(false);
    });

    it('should reject output with different score', () => {
      const result: Loop2Result = {
        validatorId: 'v1',
        score: 0.8,
        scoreSource: 'explicit',
        issues: [],
        criticalCount: 0,
        warningCount: 0,
        suggestionCount: 0,
        recommendations: [],
        output: '',
        iteration: 1,
        timestamp: new Date().toISOString(),
      };

      expect(isDefaultOutput(result)).toBe(false);
    });
  });

  describe('JSON serialization', () => {
    it('should format as JSON', () => {
      const data = { test: 'value', number: 42 };
      const json = formatAsJson(data);

      expect(json).toContain('"test": "value"');
      expect(json).toContain('"number": 42');
    });

    it('should parse JSON string', () => {
      const json = '{"test": "value", "number": 42}';
      const data = parseJson<{ test: string; number: number }>(json);

      expect(data).not.toBeNull();
      expect(data?.test).toBe('value');
      expect(data?.number).toBe(42);
    });

    it('should return null for invalid JSON', () => {
      const data = parseJson<unknown>('{invalid json}');
      expect(data).toBeNull();
    });
  });

  describe('Integration tests', () => {
    it('should process complete validator workflow', () => {
      const output = `
## Validation Confidence: 0.88

### CRITICAL Issues
- None found

### WARNING Issues
- Some performance concerns

### SUGGESTION Items
- Add integration tests
- Improve documentation

Recommendations:
- Consider caching strategy
- Add monitoring
`;
      const result = parseLoop2Output(output, 'reviewer-1', 1);
      expect(result.score).toBe(0.88);
      expect(result.warningCount).toBe(1);
      expect(result.suggestionCount).toBe(2);
      expect(result.recommendations.length).toBeGreaterThan(0);

      // Use in consensus
      const consensus = calculateConsensus([result]);
      expect(consensus.averageScore).toBe(0.88);
      expect(consensus.passed).toBe(true);
    });

    it('should process complete Loop 3 workflow', () => {
      const output = `
Implementation of authentication module complete.
Confidence: 0.90

Created files:
- src/auth/login.ts
- src/auth/logout.ts
- src/auth/refresh.ts
- tests/auth.test.ts

Tests passed: 24
Tests failed: 0

All critical features implemented and tested.
`;
      const result = parseLoop3Output(output, 'backend-dev-1', 1);

      expect(result.confidence).toBe(0.9);
      expect(result.confidenceSource).toBe('explicit');
      expect(result.testsPassedCount).toBe(24);
      expect(result.testsFailed).toBe(0);
    });
  });
});
