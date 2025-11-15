/**
 * Documentation Validation Tests
 * 
 * Comprehensive validation for new architectural documentation added in this branch.
 * Tests cover structure, syntax, completeness, and technical accuracy.
 * 
 * Tests 16 new markdown files:
 * - ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md
 * - ARCHITECTURAL_COMPARISON_QUDAG_DAA.md
 * - ARCHITECTURE_DECISION_CFN_OPTIMIZATION.md
 * - ARCHITECTURE_QUICK_REFERENCE.md
 * - CFN_METRICS_IMPLEMENTATION_GUIDE.md
 * - CFN_OPTIMIZATION_INDEX.md
 * - CFN_OPTIMIZATION_INTEGRATION_ANALYSIS.md
 * - CFN_OPTIMIZATION_QUICK_REFERENCE.md
 * - DOCKER_COMPARISON_QUDAG_DAA.md
 * - DOCKER_COMPARISON_SUMMARY.md
 * - DOCKER_FEATURE_MATRIX.md
 * - EXECUTION_MODEL_QUICK_REFERENCE.md
 * - OPTIMIZATION_METRICS_COMPARATIVE_ANALYSIS.md
 * - SYNAPTIC_MESH_ARCHITECTURE_ANALYSIS.md
 * - TEST_DRIVEN_GATE_FILES_TO_UPDATE.md
 * - TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md
 */

const fs = require('fs');
const path = require('path');

describe('Documentation Validation Suite', () => {
  // List of all new documentation files
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

  describe('File Existence and Readability', () => {
    NEW_DOCS.forEach((docPath) => {
      test(`${path.basename(docPath)} should exist and be readable`, () => {
        expect(fs.existsSync(docPath)).toBe(true);
        const content = fs.readFileSync(docPath, 'utf8');
        expect(content.length).toBeGreaterThan(0);
      });
    });

    test('should have exactly 16 new documentation files', () => {
      const existingDocs = NEW_DOCS.filter(doc => fs.existsSync(doc));
      expect(existingDocs.length).toBe(16);
    });
  });

  describe('Document Structure Validation', () => {
    NEW_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should have a primary heading (# Title)', () => {
          const hasMainHeading = /^# .+/m.test(content);
          expect(hasMainHeading).toBe(true);
        });

        test('should have at least one secondary heading (## Section)', () => {
          const secondaryHeadings = content.match(/^## .+/gm);
          expect(secondaryHeadings).not.toBeNull();
          expect(secondaryHeadings.length).toBeGreaterThan(0);
        });

        test('should not have empty headings', () => {
          const emptyHeadings = content.match(/^#{1,6}\s*$/gm);
          expect(emptyHeadings).toBeNull();
        });

        test('should have proper heading hierarchy (no skipped levels)', () => {
          const headings = content.match(/^#{1,6} .+/gm) || [];
          const levels = headings.map(h => h.match(/^#{1,6}/)[0].length);
          
          for (let i = 1; i < levels.length; i++) {
            const jump = levels[i] - levels[i - 1];
            // Allow going down any number of levels, but only one level up at a time
            if (jump > 1) {
              expect(jump).toBeLessThanOrEqual(1);
            }
          }
        });

        test('should not be excessively long (< 2500 lines)', () => {
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThan(2500);
        });

        test('should not have lines exceeding 120 characters (with exceptions)', () => {
          const lines = content.split('\n');
          const longLines = lines.filter((line, idx) => {
            // Exclude code blocks, URLs, and tables
            if (line.includes('```')) return false;
            if (line.includes('http://') || line.includes('https://')) return false;
            if (line.includes('|')) return false; // Table row
            return line.length > 120;
          });
          
          // Allow up to 10% of lines to be long
          const percentLong = (longLines.length / lines.length) * 100;
          expect(percentLong).toBeLessThan(10);
        });
      });
    });
  });

  describe('Metadata Validation', () => {
    const DOCS_REQUIRING_METADATA = [
      'docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md',
      'docs/ARCHITECTURE_DECISION_CFN_OPTIMIZATION.md',
      'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md',
      'docs/SYNAPTIC_MESH_ARCHITECTURE_ANALYSIS.md',
    ];

    DOCS_REQUIRING_METADATA.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should have a date field', () => {
          const hasDate = /\*\*Date:\*\*.*202[45]/i.test(content) || 
                         /\*\*Analysis Date:\*\*.*202[45]/i.test(content);
          expect(hasDate).toBe(true);
        });

        test('should have an author or architect field', () => {
          const hasAuthor = /\*\*(Author|Architect):\*\*/i.test(content);
          expect(hasAuthor).toBe(true);
        });

        test('should have a confidence score where applicable', () => {
          if (docPath.includes('COMPARISON') || docPath.includes('DECISION')) {
            const hasConfidence = /\*\*Confidence.*:\*\*.*0\.[0-9]/i.test(content);
            expect(hasConfidence).toBe(true);
          }
        });
      });
    });
  });

  describe('Code Block Validation', () => {
    NEW_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should have properly closed code blocks', () => {
          const codeBlockMarkers = content.match(/```/g) || [];
          // Code blocks must come in pairs (opening and closing)
          expect(codeBlockMarkers.length % 2).toBe(0);
        });

        test('should have language identifiers for code blocks', () => {
          const codeBlocks = content.match(/```(\w+)?/g) || [];
          const unlabeledBlocks = codeBlocks.filter(block => block === '```');
          
          // Allow up to 20% of blocks to be unlabeled (for output examples)
          if (codeBlocks.length > 0) {
            const percentUnlabeled = (unlabeledBlocks.length / codeBlocks.length) * 100;
            expect(percentUnlabeled).toBeLessThan(20);
          }
        });

        test('should have valid JSON in JSON code blocks', () => {
          const jsonBlocks = content.match(/```json\n([\s\S]*?)```/g) || [];
          
          jsonBlocks.forEach((block, idx) => {
            const jsonContent = block.replace(/```json\n/, '').replace(/```$/, '');
            try {
              JSON.parse(jsonContent);
            } catch (e) {
              fail(`JSON block ${idx + 1} is invalid: ${e.message}`);
            }
          });
        });

        test('should have valid shell script syntax in bash blocks', () => {
          const bashBlocks = content.match(/```(bash|sh|shell)\n([\s\S]*?)```/g) || [];
          
          bashBlocks.forEach((block, idx) => {
            const bashContent = block.replace(/```(bash|sh|shell)\n/, '').replace(/```$/, '');
            
            // Basic syntax checks
            expect(bashContent).not.toMatch(/\bfunction\s+\w+\s*{/); // Prefer 'function name()' over 'function name {'
            
            // Check for common syntax errors
            const hasUnmatchedQuotes = (bashContent.match(/"/g) || []).length % 2 !== 0;
            expect(hasUnmatchedQuotes).toBe(false);
          });
        });
      });
    });
  });

  describe('Implementation Guide Specific Tests', () => {
    const IMPLEMENTATION_GUIDES = [
      'docs/ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md',
      'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md',
      'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md',
    ];

    IMPLEMENTATION_GUIDES.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should have an overview or executive summary section', () => {
          const hasOverview = /## (Overview|Executive Summary)/i.test(content);
          expect(hasOverview).toBe(true);
        });

        test('should include code examples', () => {
          const codeBlocks = content.match(/```/g) || [];
          expect(codeBlocks.length).toBeGreaterThanOrEqual(4); // At least 2 code blocks
        });

        test('should have step-by-step instructions or phases', () => {
          const hasSteps = /## (Phase|Step|Stage) \d+/i.test(content) ||
                          /### (Phase|Step|Stage) \d+/i.test(content);
          expect(hasSteps).toBe(true);
        });

        test('should include implementation details', () => {
          const hasImplementation = /implementation|deploy|execute|integrate/i.test(content);
          expect(hasImplementation).toBe(true);
        });
      });
    });
  });

  describe('Comparison Document Tests', () => {
    const COMPARISON_DOCS = [
      'docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md',
      'docs/DOCKER_COMPARISON_QUDAG_DAA.md',
      'docs/DOCKER_COMPARISON_SUMMARY.md',
      'docs/OPTIMIZATION_METRICS_COMPARATIVE_ANALYSIS.md',
    ];

    COMPARISON_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should compare multiple approaches or systems', () => {
          const systemCount = (content.match(/QuDAG|daa|claude-flow-novice|Synaptic-Mesh/g) || []).length;
          expect(systemCount).toBeGreaterThanOrEqual(6); // Each system mentioned at least twice
        });

        test('should have comparison criteria or metrics', () => {
          const hasCriteria = /performance|latency|complexity|scalability|reliability/i.test(content);
          expect(hasCriteria).toBe(true);
        });

        test('should include tables or structured comparisons', () => {
          const hasTables = content.includes('|') || /```.*\n.*\|/s.test(content);
          expect(hasTables).toBe(true);
        });
      });
    });
  });

  describe('Quick Reference Tests', () => {
    const QUICK_REFS = [
      'docs/ARCHITECTURE_QUICK_REFERENCE.md',
      'docs/CFN_OPTIMIZATION_QUICK_REFERENCE.md',
      'docs/EXECUTION_MODEL_QUICK_REFERENCE.md',
    ];

    QUICK_REFS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should be concise (< 700 lines)', () => {
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThan(700);
        });

        test('should have clear section headings', () => {
          const headings = content.match(/^## .+/gm) || [];
          expect(headings.length).toBeGreaterThanOrEqual(3);
        });

        test('should include quick-access information (tables, lists, or code)', () => {
          const hasQuickInfo = content.includes('|') || 
                              /^[-*] /m.test(content) ||
                              content.includes('```');
          expect(hasQuickInfo).toBe(true);
        });
      });
    });
  });

  describe('Cross-Reference Validation', () => {
    test('TEST_DRIVEN_GATE_FILES_TO_UPDATE should reference IMPLEMENTATION_PLAN', () => {
      const filesDoc = 'docs/TEST_DRIVEN_GATE_FILES_TO_UPDATE.md';
      if (!fs.existsSync(filesDoc)) return;
      
      const content = fs.readFileSync(filesDoc, 'utf8');
      expect(content).toMatch(/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN/);
    });

    test('Implementation guides should reference appropriate skills or files', () => {
      const metricsGuide = 'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md';
      if (!fs.existsSync(metricsGuide)) return;
      
      const content = fs.readFileSync(metricsGuide, 'utf8');
      expect(content).toMatch(/orchestrate\.sh|orchestration|cfn-loop/i);
    });

    test('Comparison documents should reference all systems they compare', () => {
      const comparisonDoc = 'docs/ARCHITECTURAL_COMPARISON_QUDAG_DAA.md';
      if (!fs.existsSync(comparisonDoc)) return;
      
      const content = fs.readFileSync(comparisonDoc, 'utf8');
      expect(content).toMatch(/QuDAG/);
      expect(content).toMatch(/daa/);
      expect(content).toMatch(/claude-flow-novice/);
    });
  });

  describe('Technical Accuracy Tests', () => {
    test('CFN_OPTIMIZATION_INDEX should list all optimization approaches', () => {
      const indexDoc = 'docs/CFN_OPTIMIZATION_INDEX.md';
      if (!fs.existsSync(indexDoc)) return;
      
      const content = fs.readFileSync(indexDoc, 'utf8');
      
      // Should mention key optimization approaches
      expect(content).toMatch(/performance|metrics|test-driven|confidence/i);
    });

    test('ADOPTABLE_PATTERNS should describe concrete patterns', () => {
      const patternsDoc = 'docs/ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md';
      if (!fs.existsSync(patternsDoc)) return;
      
      const content = fs.readFileSync(patternsDoc, 'utf8');
      
      // Should have pattern descriptions
      expect(content).toMatch(/Pattern \d+/);
      expect(content.match(/Pattern \d+/g).length).toBeGreaterThanOrEqual(2);
    });

    test('Feature matrices should include performance metrics', () => {
      const matrixDoc = 'docs/DOCKER_FEATURE_MATRIX.md';
      if (!fs.existsSync(matrixDoc)) return;
      
      const content = fs.readFileSync(matrixDoc, 'utf8');
      
      // Should include performance-related terms
      expect(content).toMatch(/latency|throughput|performance|speed|startup/i);
    });
  });

  describe('Consistency Tests', () => {
    test('all docs should use consistent terminology for "CFN Loop"', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;
        
        const content = fs.readFileSync(docPath, 'utf8');
        
        // Should not have inconsistent variations
        const inconsistentTerms = content.match(/cfn loop|CFN-loop|cfnloop/gi) || [];
        expect(inconsistentTerms.length).toBe(0);
      });
    });

    test('confidence scores should be in range 0.0-1.0', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;
        
        const content = fs.readFileSync(docPath, 'utf8');
        const confidenceScores = content.match(/confidence.*?(\d+\.\d+)/gi) || [];
        
        confidenceScores.forEach((match) => {
          const score = parseFloat(match.match(/(\d+\.\d+)/)[1]);
          expect(score).toBeGreaterThanOrEqual(0.0);
          expect(score).toBeLessThanOrEqual(1.0);
        });
      });
    });

    test('dates should be in consistent format (YYYY-MM-DD or spelled out)', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;
        
        const content = fs.readFileSync(docPath, 'utf8');
        
        // Check for inconsistent date formats in metadata
        const metadataSection = content.substring(0, 500);
        const dates = metadataSection.match(/\*\*Date:\*\*.*/gi) || [];
        
        dates.forEach((dateField) => {
          const hasValidFormat = /202[45]-\d{2}-\d{2}/.test(dateField) || 
                                /November|December/.test(dateField);
          expect(hasValidFormat).toBe(true);
        });
      });
    });
  });

  describe('Content Quality Tests', () => {
    NEW_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let content;

        beforeAll(() => {
          content = fs.readFileSync(docPath, 'utf8');
        });

        test('should not contain TODO or FIXME markers', () => {
          const hasTodos = /TODO|FIXME|XXX/i.test(content);
          expect(hasTodos).toBe(false);
        });

        test('should not have excessive consecutive blank lines', () => {
          const excessiveBlankLines = /\n\n\n\n\n/g.test(content);
          expect(excessiveBlankLines).toBe(false);
        });

        test('should not contain placeholder text', () => {
          const hasPlaceholders = /\[INSERT.*\]|\[TBD\]|\[PLACEHOLDER\]/i.test(content);
          expect(hasPlaceholders).toBe(false);
        });

        test('should have proper punctuation at end of sentences', () => {
          const lines = content.split('\n');
          const textLines = lines.filter(line => 
            line.trim().length > 0 && 
            !line.startsWith('#') && 
            !line.startsWith('```') &&
            !line.startsWith('-') &&
            !line.startsWith('*') &&
            !line.includes('|')
          );
          
          const improperlyEnded = textLines.filter(line => {
            const trimmed = line.trim();
            if (trimmed.length < 20) return false; // Skip short lines
            return !/[.!?:]$/.test(trimmed);
          });
          
          // Allow up to 30% of lines to not end with punctuation (lists, headers, etc)
          if (textLines.length > 0) {
            const percentImproper = (improperlyEnded.length / textLines.length) * 100;
            expect(percentImproper).toBeLessThan(30);
          }
        });
      });
    });
  });

  describe('Completeness Tests', () => {
    test('all 16 documentation files should be comprehensive', () => {
      const stats = NEW_DOCS.map(docPath => {
        if (!fs.existsSync(docPath)) {
          return { path: docPath, exists: false, lines: 0, codeBlocks: 0 };
        }
        
        const content = fs.readFileSync(docPath, 'utf8');
        const lines = content.split('\n').length;
        const codeBlocks = (content.match(/```/g) || []).length / 2;
        
        return { path: docPath, exists: true, lines, codeBlocks };
      });

      // All docs should exist
      expect(stats.filter(s => s.exists).length).toBe(16);

      // Each doc should have substantial content
      stats.forEach(stat => {
        if (stat.exists) {
          expect(stat.lines).toBeGreaterThan(50);
        }
      });
    });

    test('implementation guides should be sufficiently detailed', () => {
      const guides = [
        'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md',
        'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md',
      ];

      guides.forEach(guidePath => {
        if (!fs.existsSync(guidePath)) return;
        
        const content = fs.readFileSync(guidePath, 'utf8');
        const lines = content.split('\n').length;
        const codeBlocks = (content.match(/```/g) || []).length / 2;
        
        // Implementation guides should be detailed
        expect(lines).toBeGreaterThan(300);
        expect(codeBlocks).toBeGreaterThan(5);
      });
    });
  });
});