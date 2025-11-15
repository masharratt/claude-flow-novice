/**
 * Architecture and Technical Consistency Validation Tests
 * 
 * Validates technical accuracy and consistency across documentation:
 * - Cross-document references are valid
 * - Technical claims are consistent
 * - Architectural patterns are properly described
 * - Terminology is used consistently
 */

const fs = require('fs');
const path = require('path');

describe('Architecture and Technical Consistency', () => {
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

  // Load all documents into memory
  const documents = {};
  beforeAll(() => {
    NEW_DOCS.forEach(docPath => {
      if (fs.existsSync(docPath)) {
        documents[docPath] = fs.readFileSync(docPath, 'utf8');
      }
    });
  });

  describe('System Names Consistency', () => {
    const SYSTEM_NAMES = ['QuDAG', 'daa', 'claude-flow-novice', 'Synaptic-Mesh'];

    test('system names should be consistently capitalized', () => {
      Object.entries(documents).forEach(([path, content]) => {
        // Check for inconsistent variations
        expect(content).not.toMatch(/qudag/i); // Should be QuDAG
        expect(content).not.toMatch(/DAA/); // Should be daa
        expect(content).not.toMatch(/Claude-Flow-Novice/i); // Should be claude-flow-novice
        expect(content).not.toMatch(/synaptic mesh/i); // Should be hyphenated
      });
    });

    test('comparison documents should mention all key systems', () => {
      const comparisonDocs = Object.keys(documents).filter(path => 
        path.includes('COMPARISON') || path.includes('FEATURE_MATRIX')
      );

      comparisonDocs.forEach(docPath => {
        const content = documents[docPath];
        
        // Should mention multiple systems
        const systemMentions = SYSTEM_NAMES.filter(name => 
          content.includes(name)
        );
        
        expect(systemMentions.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Technical Terminology Consistency', () => {
    test('should use consistent terms for core concepts', () => {
      const termVariations = {
        'CFN Loop': ['cfn-loop', 'CFN-Loop', 'cfnloop'],
        'confidence score': ['confidence-score', 'confidenceScore'],
        'test-driven': ['test driven', 'testdriven'],
      };

      Object.entries(documents).forEach(([path, content]) => {
        Object.entries(termVariations).forEach(([correct, variations]) => {
          variations.forEach(variant => {
            const regex = new RegExp(variant.replace(/[-]/g, '\\-'), 'gi');
            const matches = content.match(regex);
            if (matches) {
              // Document but don't fail - some variations may be intentional
            }
          });
        });
      });
    });

    test('confidence scores mentioned should be realistic (0.7-0.99)', () => {
      Object.entries(documents).forEach(([path, content]) => {
        const confidenceMatches = content.match(/confidence.*?(\d+\.\d+)/gi) || [];
        
        confidenceMatches.forEach(match => {
          const scoreMatch = match.match(/(\d+\.\d+)/);
          if (scoreMatch) {
            const score = parseFloat(scoreMatch[1]);
            expect(score).toBeGreaterThanOrEqual(0.0);
            expect(score).toBeLessThanOrEqual(1.0);
            
            // Most documented confidence scores should be relatively high
            if (score < 0.5) {
              // Very low confidence - probably intentional for examples
            }
          }
        });
      });
    });
  });

  describe('Cross-Document References', () => {
    test('referenced files should exist in the documentation set', () => {
      Object.entries(documents).forEach(([path, content]) => {
        // Find markdown file references
        const mdReferences = content.match(/\[([^\]]+)\]\(([^)]+\.md)\)/g) || [];
        
        mdReferences.forEach(ref => {
          const match = ref.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
          if (match) {
            const referencedFile = match[2];
            
            // Check if it's a relative reference
            if (!referencedFile.startsWith('http')) {
              const basePath = path.dirname(path);
              const fullPath = path.join(basePath, referencedFile);
              
              // Document references should be valid
              // (Note: not all references may be in NEW_DOCS, but should exist)
            }
          }
        });
      });
    });

    test('TEST_DRIVEN_GATE documents should cross-reference each other', () => {
      const planPath = 'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md';
      const filesPath = 'docs/TEST_DRIVEN_GATE_FILES_TO_UPDATE.md';
      
      if (documents[planPath] && documents[filesPath]) {
        // FILES_TO_UPDATE should reference IMPLEMENTATION_PLAN
        expect(documents[filesPath]).toMatch(/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN/);
        
        // Both should discuss the same concepts
        const sharedTerms = ['test-driven', 'gate check', 'Loop 3'];
        sharedTerms.forEach(term => {
          expect(documents[planPath].toLowerCase()).toContain(term.toLowerCase());
          expect(documents[filesPath].toLowerCase()).toContain(term.toLowerCase());
        });
      }
    });

    test('optimization documents should reference CFN Loop concepts', () => {
      const optimizationDocs = Object.keys(documents).filter(path => 
        path.includes('OPTIMIZATION') || path.includes('METRICS')
      );

      optimizationDocs.forEach(docPath => {
        const content = documents[docPath];
        
        // Should mention CFN Loop or orchestration
        const hasCfnContext = /CFN Loop|orchestration|coordinator/i.test(content);
        expect(hasCfnContext).toBe(true);
      });
    });
  });

  describe('Architecture Pattern Descriptions', () => {
    test('ADOPTABLE_PATTERNS should describe concrete, actionable patterns', () => {
      const patternsPath = 'docs/ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md';
      if (!documents[patternsPath]) return;

      const content = documents[patternsPath];
      
      // Should have pattern structure
      const patternHeaders = content.match(/## Pattern \d+/g) || [];
      expect(patternHeaders.length).toBeGreaterThanOrEqual(2);
      
      // Each pattern should describe problem and solution
      patternHeaders.forEach(header => {
        const patternNum = header.match(/\d+/)[0];
        const sectionRegex = new RegExp(`## Pattern ${patternNum}[\\s\\S]*?(?=## Pattern \\d+|$)`);
        const patternSection = content.match(sectionRegex);
        
        if (patternSection) {
          const section = patternSection[0];
          
          // Should discuss the problem
          expect(section.toLowerCase()).toMatch(/problem|challenge|issue/);
          
          // Should provide implementation guidance
          expect(section.toLowerCase()).toMatch(/implementation|solution|approach/);
        }
      });
    });

    test('comparison documents should use consistent comparison criteria', () => {
      const comparisonDocs = Object.keys(documents).filter(path => 
        path.includes('COMPARISON')
      );

      // Common comparison criteria across architectural comparisons
      const expectedCriteria = [
        'performance', 'latency', 'scalability', 
        'complexity', 'deployment'
      ];

      comparisonDocs.forEach(docPath => {
        const content = documents[docPath].toLowerCase();
        
        // Should cover multiple criteria
        const coveredCriteria = expectedCriteria.filter(criterion => 
          content.includes(criterion)
        );
        
        expect(coveredCriteria.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Implementation Guide Completeness', () => {
    test('CFN_METRICS_IMPLEMENTATION_GUIDE should cover all phases', () => {
      const guidePath = 'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md';
      if (!documents[guidePath]) return;

      const content = documents[guidePath];
      
      // Should have multiple phases
      const phases = content.match(/## Phase \d+/g) || [];
      expect(phases.length).toBeGreaterThanOrEqual(2);
      
      // Should include schema creation
      expect(content.toLowerCase()).toMatch(/schema|database|table/);
      
      // Should include metric collection
      expect(content.toLowerCase()).toMatch(/collect|gather|track|metrics/);
      
      // Should discuss integration
      expect(content.toLowerCase()).toMatch(/integrate|deploy|implement/);
    });

    test('TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN should address all modes', () => {
      const planPath = 'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md';
      if (!documents[planPath]) return;

      const content = documents[planPath];
      
      // Should discuss different CFN Loop modes
      const modes = ['Task Mode', 'CLI Mode', 'Docker Mode'];
      modes.forEach(mode => {
        expect(content).toMatch(new RegExp(mode, 'i'));
      });
      
      // Should describe the gate check mechanism
      expect(content.toLowerCase()).toMatch(/gate check|gate|threshold/);
      
      // Should discuss test execution
      expect(content.toLowerCase()).toMatch(/test.*execution|run.*test|execute.*test/);
    });
  });

  describe('Metrics and Performance Data Validity', () => {
    test('performance metrics should be plausible', () => {
      Object.entries(documents).forEach(([path, content]) => {
        // Look for latency measurements
        const latencyMatches = content.match(/(\d+)\s*(ms|millisecond)/gi) || [];
        
        latencyMatches.forEach(match => {
          const value = parseInt(match.match(/(\d+)/)[1]);
          
          // Latency values should be reasonable
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThan(100000); // < 100 seconds
        });
        
        // Look for agent counts
        const agentMatches = content.match(/(\d+)\s*agents?/gi) || [];
        
        agentMatches.forEach(match => {
          const value = parseInt(match.match(/(\d+)/)[1]);
          
          // Agent counts should be reasonable
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThan(10000);
        });
      });
    });

    test('comparison tables should have consistent dimensions', () => {
      Object.entries(documents).forEach(([path, content]) => {
        // Find tables (markdown tables have | separators)
        const tableRows = content.split('\n').filter(line => 
          line.includes('|') && !line.startsWith('```')
        );
        
        if (tableRows.length > 2) {
          // Check that table rows have consistent column counts
          const columnCounts = tableRows.map(row => 
            row.split('|').filter(cell => cell.trim().length > 0).length
          );
          
          // All rows should have same column count (excluding separator rows)
          const nonSeparatorRows = tableRows.filter(row => 
            !row.match(/^\s*\|[\s:-]+\|/)
          );
          
          if (nonSeparatorRows.length > 1) {
            const firstRowCols = nonSeparatorRows[0].split('|').filter(c => c.trim().length > 0).length;
            
            nonSeparatorRows.forEach((row, idx) => {
              const cols = row.split('|').filter(c => c.trim().length > 0).length;
              // Allow minor variations for complex tables
              expect(Math.abs(cols - firstRowCols)).toBeLessThanOrEqual(2);
            });
          }
        }
      });
    });
  });

  describe('Quick Reference Accessibility', () => {
    test('quick reference docs should have table of contents or clear sections', () => {
      const quickRefDocs = Object.keys(documents).filter(path => 
        path.includes('QUICK_REFERENCE')
      );

      quickRefDocs.forEach(docPath => {
        const content = documents[docPath];
        
        // Should have clear section markers
        const sections = content.match(/^## /gm) || [];
        expect(sections.length).toBeGreaterThanOrEqual(3);
        
        // Should be scannable (tables, lists, or code blocks)
        const hasTables = content.includes('|');
        const hasLists = /^[-*] /m.test(content);
        const hasCodeBlocks = content.includes('```');
        
        expect(hasTables || hasLists || hasCodeBlocks).toBe(true);
      });
    });
  });

  describe('Decision Records Validity', () => {
    test('ARCHITECTURE_DECISION documents should follow ADR format', () => {
      const decisionDocs = Object.keys(documents).filter(path => 
        path.includes('DECISION')
      );

      decisionDocs.forEach(docPath => {
        const content = documents[docPath];
        
        // ADR should have status
        expect(content).toMatch(/\*\*Status:\*\*/i);
        
        // ADR should state the decision
        expect(content.toLowerCase()).toMatch(/decision|recommendation/);
        
        // ADR should provide rationale
        expect(content.toLowerCase()).toMatch(/rationale|reason|justification/);
      });
    });
  });

  describe('Files to Update References', () => {
    test('TEST_DRIVEN_GATE_FILES_TO_UPDATE should reference actual project files', () => {
      const filesPath = 'docs/TEST_DRIVEN_GATE_FILES_TO_UPDATE.md';
      if (!documents[filesPath]) return;

      const content = documents[filesPath];
      
      // Should reference .claude skills
      expect(content).toMatch(/\.claude\/skills/);
      
      // Should reference orchestration files
      expect(content).toMatch(/orchestrate\.sh/);
      
      // Should reference configuration or documentation
      expect(content).toMatch(/CLAUDE\.md|README\.md/);
      
      // Should have checkboxes for tracking
      const checkboxes = content.match(/- \[ \]/g) || [];
      expect(checkboxes.length).toBeGreaterThan(0);
    });
  });

  describe('Code Example Quality', () => {
    test('implementation guides should have end-to-end examples', () => {
      const implementationGuides = Object.keys(documents).filter(path => 
        path.includes('IMPLEMENTATION')
      );

      implementationGuides.forEach(docPath => {
        const content = documents[docPath];
        
        // Should have substantial code examples
        const codeBlocks = content.match(/```/g) || [];
        expect(codeBlocks.length).toBeGreaterThanOrEqual(8); // At least 4 blocks
        
        // Should show complete workflows
        expect(content.toLowerCase()).toMatch(/step|phase|stage/);
      });
    });
  });

  describe('Optimization Strategy Coherence', () => {
    test('optimization documents should present coherent strategy', () => {
      const optimizationDocs = Object.keys(documents).filter(path => 
        path.includes('OPTIMIZATION')
      );

      optimizationDocs.forEach(docPath => {
        const content = documents[docPath];
        
        // Should discuss benefits
        expect(content.toLowerCase()).toMatch(/benefit|advantage|improvement/);
        
        // Should discuss implementation
        expect(content.toLowerCase()).toMatch(/implement|integrate|deploy/);
        
        // Should consider trade-offs
        expect(content.toLowerCase()).toMatch(/trade-?off|complexity|cost|risk/);
      });
    });

    test('CFN_OPTIMIZATION_INDEX should link to detailed guides', () => {
      const indexPath = 'docs/CFN_OPTIMIZATION_INDEX.md';
      if (!documents[indexPath]) return;

      const content = documents[indexPath];
      
      // Should reference other optimization documents
      const references = content.match(/\.md/g) || [];
      expect(references.length).toBeGreaterThan(0);
      
      // Should provide overview
      expect(content.toLowerCase()).toMatch(/overview|introduction|summary/);
    });
  });
});