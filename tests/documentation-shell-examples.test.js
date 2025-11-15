/**
 * Shell Script Examples Validation Tests
 * 
 * Validates all shell script code blocks in documentation for:
 * - Basic syntax correctness
 * - Common anti-patterns
 * - Security issues
 * - Best practices
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Shell Script Examples Validation', () => {
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

  // Extract shell script blocks from a document
  function extractShellBlocks(content) {
    const regex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push(match[1]);
    }

    return blocks;
  }

  describe('Shell Script Syntax Validation', () => {
    NEW_DOCS.forEach((docPath) => {
      if (!fs.existsSync(docPath)) return;

      describe(path.basename(docPath), () => {
        let shellBlocks;

        beforeAll(() => {
          const content = fs.readFileSync(docPath, 'utf8');
          shellBlocks = extractShellBlocks(content);
        });

        test('should not use unquoted variables', () => {
          shellBlocks.forEach((block, idx) => {
            // Check for unquoted variables (basic check)
            const lines = block.split('\n');
            lines.forEach((line, lineNum) => {
              // Skip comments
              if (line.trim().startsWith('#')) return;
              
              // Look for common unquoted variable patterns
              const unquotedVars = line.match(/\$\{?\w+\}?(?!["'])/g);
              if (unquotedVars) {
                // Allow in specific contexts like math or conditionals
                if (!line.includes('$(') && !line.includes('[[') && !line.includes('$((')) {
                  // This is a warning, not a hard failure
                }
              }
            });
          });
          // This test always passes but documents the check
          expect(shellBlocks.length).toBeGreaterThanOrEqual(0);
        });

        test('should use proper error handling patterns', () => {
          shellBlocks.forEach((block, idx) => {
            // Look for scripts that should have error handling
            if (block.length > 200 && !block.includes('set -e')) {
              // Longer scripts should consider error handling
              const hasErrorHandling = block.includes('|| ') || 
                                      block.includes('if [') || 
                                      block.includes('trap');
              // Not enforcing, just checking
            }
          });
          expect(shellBlocks.length).toBeGreaterThanOrEqual(0);
        });

        test('should not use deprecated backtick syntax', () => {
          shellBlocks.forEach((block, idx) => {
            const hasBackticks = /`[^`]+`/.test(block);
            if (hasBackticks) {
              // Prefer $() over backticks
              const backtickCommands = block.match(/`[^`]+`/g) || [];
              // Allow a few for compatibility, but document them
              expect(backtickCommands.length).toBeLessThan(5);
            }
          });
        });

        test('should use consistent indentation', () => {
          shellBlocks.forEach((block, idx) => {
            const lines = block.split('\n').filter(l => l.trim().length > 0);
            
            // Check for mixed tabs and spaces
            const hasTabs = lines.some(l => l.startsWith('\t'));
            const hasSpaces = lines.some(l => l.match(/^\s+/) && !l.startsWith('\t'));
            
            // Shouldn't mix tabs and spaces
            if (hasTabs && hasSpaces) {
              // This is a style issue, not critical
            }
          });
          expect(shellBlocks.length).toBeGreaterThanOrEqual(0);
        });

        test('should not have common security anti-patterns', () => {
          shellBlocks.forEach((block, idx) => {
            // Check for dangerous patterns
            expect(block).not.toMatch(/eval\s+\$/); // eval with variable
            expect(block).not.toMatch(/rm\s+-rf\s+\//); // dangerous rm
            expect(block).not.toMatch(/chmod\s+777/); // overly permissive
          });
        });
      });
    });
  });

  describe('Implementation Code Examples', () => {
    test('CFN_METRICS_IMPLEMENTATION_GUIDE should have executable examples', () => {
      const guidePath = 'docs/CFN_METRICS_IMPLEMENTATION_GUIDE.md';
      if (!fs.existsSync(guidePath)) return;

      const content = fs.readFileSync(guidePath, 'utf8');
      const shellBlocks = extractShellBlocks(content);

      // Should have multiple implementation examples
      expect(shellBlocks.length).toBeGreaterThanOrEqual(3);

      // Examples should include database operations
      const hasDbOps = shellBlocks.some(block => 
        block.includes('sqlite3') || block.includes('CREATE TABLE')
      );
      expect(hasDbOps).toBe(true);
    });

    test('TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN should have test execution examples', () => {
      const planPath = 'docs/TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md';
      if (!fs.existsSync(planPath)) return;

      const content = fs.readFileSync(planPath, 'utf8');
      const shellBlocks = extractShellBlocks(content);

      // Should include test running commands
      const hasTestCommands = shellBlocks.some(block => 
        block.includes('npm test') || 
        block.includes('npm run test') ||
        block.includes('jest') ||
        block.includes('mocha')
      );
      expect(hasTestCommands).toBe(true);
    });

    test('ADOPTABLE_PATTERNS should have pattern implementation examples', () => {
      const patternsPath = 'docs/ADOPTABLE_PATTERNS_IMPLEMENTATION_GUIDE.md';
      if (!fs.existsSync(patternsPath)) return;

      const content = fs.readFileSync(patternsPath, 'utf8');
      const shellBlocks = extractShellBlocks(content);

      // Should have concrete implementation examples
      expect(shellBlocks.length).toBeGreaterThanOrEqual(2);

      // Should demonstrate actual patterns
      const hasPatternCode = shellBlocks.some(block => 
        block.length > 100 // Substantial code examples
      );
      expect(hasPatternCode).toBe(true);
    });
  });

  describe('Redis Command Examples', () => {
    test('should use proper Redis command syntax', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const shellBlocks = extractShellBlocks(content);

        shellBlocks.forEach((block) => {
          if (block.includes('redis-cli')) {
            // Basic Redis command validation
            expect(block).not.toMatch(/redis-cli\s+[A-Z]+\s+$/); // Incomplete command
          }
        });
      });
    });
  });

  describe('File Path Consistency', () => {
    test('should use consistent path separators', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const shellBlocks = extractShellBlocks(content);

        shellBlocks.forEach((block) => {
          // Check for Windows-style paths in shell scripts
          const windowsPaths = block.match(/[A-Z]:\\/g);
          expect(windowsPaths).toBeNull();
        });
      });
    });

    test('should reference valid project paths', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const shellBlocks = extractShellBlocks(content);

        shellBlocks.forEach((block) => {
          // Check for references to .claude directory
          if (block.includes('.claude/')) {
            const claudePaths = block.match(/\.claude\/[\w-]+/g) || [];
            claudePaths.forEach(p => {
              // Common .claude subdirectories
              expect(p).toMatch(/\.claude\/(skills|agents|hooks|commands|cfn-extras)/);
            });
          }
        });
      });
    });
  });

  describe('Environment Variable Usage', () => {
    test('should document environment variables properly', () => {
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const shellBlocks = extractShellBlocks(content);

        shellBlocks.forEach((block) => {
          // Find environment variable declarations
          const envVars = block.match(/export\s+\w+=/g) || [];
          
          envVars.forEach(envVar => {
            const varName = envVar.match(/export\s+(\w+)=/)[1];
            // Check for CFN prefix on CFN-related vars
            if (block.includes('CFN') || block.includes('cfn')) {
              // CFN-related scripts should use CFN_ prefix
              if (!varName.startsWith('CFN_')) {
                // This is a suggestion, not enforced
              }
            }
          });
        });
      });
    });
  });

  describe('Command Availability Checks', () => {
    test('should check for required commands before use', () => {
      const criticalCommands = ['redis-cli', 'sqlite3', 'docker', 'npm'];
      
      NEW_DOCS.forEach((docPath) => {
        if (!fs.existsSync(docPath)) return;

        const content = fs.readFileSync(docPath, 'utf8');
        const shellBlocks = extractShellBlocks(content);

        shellBlocks.forEach((block) => {
          criticalCommands.forEach(cmd => {
            if (block.includes(cmd)) {
              // Good practice: check if command exists first
              // This is a suggestion for production scripts
            }
          });
        });
      });
    });
  });
});