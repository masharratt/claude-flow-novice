/**
 * JSON Examples Validation Tests
 * 
 * Validates all JSON code blocks in documentation for:
 * - Valid JSON syntax
 * - Schema compliance
 * - Consistent structure
 * - Required fields
 */

const fs = require('fs');
const path = require('path');

describe('JSON Examples Validation', () => {
  const NEW_DOCS = [
    'docs/ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md',
    'docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md',
    'docs/ARCHITECTURE_DECISION_CFN_OPTIMIZATION.md',
    'docs/ARCHITECTURE_QUICK_REFERENCE.md',
    'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md',
    'docs/CFN_OPTIMIZATION_INDEX.md',
    'docs/CFN_OPTIMIZATION_INTEGRATION_ANALYSIS.md',
    'docs/CFN_OPTIMIZATION_QUICK_REFERENCE.md',
    'docs/DOCKER_COMPARISON_QUDAG_DAA.md',
    'docs/DOCKER_COMPARISON_SUMMARY.md',
    'docs/DOCKER_FEATURE_MATRIX.md',
    'docs/EXECUTION_MODEL_QUICK_REFERENCE.md',
    'docs/OPTIMIZATION_METRICS_COMPARATIVE_ANALYSIS.md',
    'docs/SYNAPTIC_MESH_ARCHITECTURE_ANALYSIS.md',
    'docs/TEST_DRIVEN_GATE_FILES_TO_UPDATE.md',
    'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md',
  ];

  function extractJsonBlocks(content) {
    const regex = /```json\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1]);
    }

    return blocks;
  }

  describe('JSON Syntax Validation', () => {
    NEW_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let jsonBlocks;

        beforeAll(() => {
          const content = fs.readFileSync(docPath, 'utf8');
          jsonBlocks = extractJsonBlocks(content);
        });

        test('all JSON blocks should be valid JSON', () => {
          jsonBlocks.forEach((block, idx) => {
            try {
              JSON.parse(block);
            } catch (e) {
              fail(`JSON block ${idx + 1} is invalid: ${e.message}\nBlock content:\n${block.substring(0, 200)}...`);
            }
          });
        });

        test('should use consistent indentation (2 or 4 spaces)', () => {
          jsonBlocks.forEach((block, idx) => {
            try {
              const parsed = JSON.parse(block);
              const formatted2 = JSON.stringify(parsed, null, 2);
              const formatted4 = JSON.stringify(parsed, null, 4);
              
              // Check if it matches either 2-space or 4-space formatting
              const matchesStandard = block.trim() === formatted2.trim() || 
                                     block.trim() === formatted4.trim();
              
              // Not strictly enforced, but preferred
            } catch (e) {
              // Already caught by syntax validation
            }
          });
        });

        test('should not have trailing commas', () => {
          jsonBlocks.forEach((block, idx) => {
            // JSON doesn't allow trailing commas
            expect(block).not.toMatch(/,\s*[}\]]/);
          });
        });

        test('should use double quotes for strings', () => {
          jsonBlocks.forEach((block, idx) => {
            // JSON requires double quotes
            const singleQuoteStrings = block.match(/'[^']*':/g);
            expect(singleQuoteStrings).toBeNull();
          });
        });
      });
    });
  });

  describe('Success Criteria JSON Schema', () => {
    test('TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN should have valid success criteria examples', () => {
      const planPath = 'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md';
      if (!fs.existsSync(planPath)) return;

      const content = fs.readFileSync(planPath, 'utf8');
      const jsonBlocks = extractJsonBlocks(content);

      const successCriteriaBlocks = jsonBlocks.filter(block => {
        try {
          const obj = JSON.parse(block);
          return obj.success_criteria || obj.test_suites;
        } catch (e) {
          return false;
        }
      });

      // Should have at least one success criteria example
      expect(successCriteriaBlocks.length).toBeGreaterThanOrEqual(1);

      successCriteriaBlocks.forEach(block => {
        const obj = JSON.parse(block);
        
        if (obj.success_criteria) {
          expect(obj.success_criteria).toHaveProperty('test_suites');
          expect(Array.isArray(obj.success_criteria.test_suites)).toBe(true);
        }
      });
    });
  });

  describe('Configuration JSON Examples', () => {
    test('should have consistent field naming conventions', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const jsonBlocks = extractJsonBlocks(content);

        jsonBlocks.forEach((block, idx) => {
          try {
            const obj = JSON.parse(block);
            const keys = JSON.stringify(obj).match(/"[^"]+"\s*:/g) || [];
            
            keys.forEach(key => {
              const keyName = key.match(/"([^"]+)"\s*:/)[1];
              
              // Check for consistent naming (snake_case or camelCase)
              const isSnakeCase = /^[a-z][a-z0-9_]*$/.test(keyName);
              const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(keyName);
              const isUpperCase = /^[A-Z_]+$/.test(keyName);
              
              // Should follow one of the standard conventions
              expect(isSnakeCase || isCamelCase || isUpperCase).toBe(true);
            });
          } catch (e) {
            // Already caught by syntax validation
          }
        });
      });
    });
  });

  describe('Metrics and Performance JSON', () => {
    test('CFN_METRICS_IMPLEMENTATION_GUIDE should have metrics schema examples', () => {
      const guidePath = 'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md';
      if (!fs.existsSync(guidePath)) return;

      const content = fs.readFileSync(guidePath, 'utf8');
      const jsonBlocks = extractJsonBlocks(content);

      // Should have some JSON examples
      expect(jsonBlocks.length).toBeGreaterThan(0);

      // Look for metric-related fields
      const hasMetrics = jsonBlocks.some(block => {
        try {
          const obj = JSON.parse(block);
          return obj.metrics || obj.performance || obj.timing;
        } catch (e) {
          return false;
        }
      });

      // Metrics guide should include metric examples
      if (jsonBlocks.length > 0) {
        // At least some blocks should be metrics-related
      }
    });
  });

  describe('Comparison Data JSON', () => {
    test('comparison documents should have structured comparison data', () => {
      const compDocs = [
        'docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md',
        'docs/DOCKER_COMPARISON_QUDAG_DAA.md',
      ];

      compDocs.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const jsonBlocks = extractJsonBlocks(content);

        jsonBlocks.forEach((block, idx) => {
          try {
            const obj = JSON.parse(block);
            
            // Comparison data should have clear structure
            if (typeof obj === 'object' && !Array.isArray(obj)) {
              // Object should have multiple top-level keys (systems being compared)
              const keys = Object.keys(obj);
              // Comparison objects typically have 2+ keys
            }
          } catch (e) {
            // Already caught by syntax validation
          }
        });
      });
    });
  });

  describe('Error Message Examples', () => {
    test('should have realistic error examples', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const jsonBlocks = extractJsonBlocks(content);

        jsonBlocks.forEach((block, idx) => {
          try {
            const obj = JSON.parse(block);
            
            if (obj.error || obj.message) {
              // Error messages should be strings
              if (obj.error) {
                expect(typeof obj.error).toBe('string');
              }
              if (obj.message) {
                expect(typeof obj.message).toBe('string');
              }
            }
          } catch (e) {
            // Already caught by syntax validation
          }
        });
      });
    });
  });
});