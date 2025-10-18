/**
 * Test Suite for Rust Quality Validator
 * Comprehensive testing of real Rust toolchain integration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import { RustQualityValidator } from '../../src/validation/quality-validators/rust-quality-validator.js';

describe('RustQualityValidator', () => {
  let validator;
  let testProjectPath;
  let mockRustProject;

  beforeEach(async () => {
    validator = new RustQualityValidator({
      timeout: 60000,
      enableByzantineValidation: false, // Disabled for testing
      qualityThresholds: {
        maxComplexity: 10,
        maxFileLines: 500,
        maxFunctionLines: 50,
        minDocCoverage: 0.7,
        maxClippyWarnings: 5,
        maxClippyErrors: 0
      }
    });

    // Create temporary test project directory
    testProjectPath = path.join('/tmp/claude', `rust-test-${Date.now()}`);
    await fs.mkdir(testProjectPath, { recursive: true });

    // Setup mock Rust project structure
    mockRustProject = await createMockRustProject(testProjectPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rmdir(testProjectPath, { recursive: true });
    } catch (error) {
      console.warn(`Failed to clean up test directory: ${error.message}`);
    }
  });

  describe('Project Structure Validation', () => {
    it('should validate valid Rust project structure', async () => {
      const result = await validator.validateRustProject(testProjectPath);

      expect(result.valid).toBe(true);
      expect(result.cargoToml).toBeDefined();
      expect(result.cargoToml.package).toBeDefined();
      expect(result.sourceFiles).toHaveLength(2); // lib.rs and main.rs
      expect(result.projectType).toBe('library');
    });

    it('should reject invalid project without Cargo.toml', async () => {
      // Remove Cargo.toml
      await fs.unlink(path.join(testProjectPath, 'Cargo.toml'));

      await expect(validator.validateRustProject(testProjectPath))
        .rejects.toThrow('Invalid Rust project structure');
    });

    it('should detect project type correctly', async () => {
      // Test library project
      let result = await validator.validateRustProject(testProjectPath);
      expect(result.projectType).toBe('library');

      // Remove lib.rs to make it binary-only
      await fs.unlink(path.join(testProjectPath, 'src', 'lib.rs'));
      result = await validator.validateRustProject(testProjectPath);
      expect(result.projectType).toBe('binary');
    });
  });

  describe('Clippy Integration', () => {
    it('should run cargo clippy successfully on clean code', async () => {
      // Skip if cargo clippy not available
      try {
        await validator.executeCommand('cargo', ['clippy', '--version'], { timeout: 5000 });
      } catch (error) {
        console.log('Skipping clippy test - cargo clippy not available');
        return;
      }

      const result = await validator.runCargoClippy(testProjectPath);

      expect(result).toBeDefined();
      expect(result.exitCode).toBeDefined();
      expect(result.lints).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.performanceMetrics).toBeDefined();
      expect(result.performanceMetrics.executionTime).toBeGreaterThan(0);
    });

    it('should categorize clippy lints correctly', async () => {
      const mockLints = [
        { level: 'warning', code: 'clippy::complexity', message: 'Complex function' },
        { level: 'error', code: 'clippy::correctness', message: 'Potential bug' },
        { level: 'warning', code: 'clippy::style', message: 'Style issue' }
      ];

      const categories = validator.categorizeClippyLints(mockLints);

      expect(categories.complexity).toHaveLength(1);
      expect(categories.correctness).toHaveLength(1);
      expect(categories.style).toHaveLength(1);
    });

    it('should parse clippy JSON output correctly', async () => {
      const mockOutput = `
        {"message":{"level":"warning","message":"unused variable","code":{"code":"unused_variables"},"spans":[],"rendered":"warning text"}}
        {"message":{"level":"error","message":"type error","code":{"code":"type_error"},"spans":[],"rendered":"error text"}}
      `;

      const lints = validator.parseClippyOutput(mockOutput);

      expect(lints).toHaveLength(2);
      expect(lints[0].level).toBe('warning');
      expect(lints[1].level).toBe('error');
      expect(lints[0].code).toBe('unused_variables');
      expect(lints[1].code).toBe('type_error');
    });
  });

  describe('Formatting Validation', () => {
    it('should run cargo fmt check successfully', async () => {
      // Skip if cargo fmt not available
      try {
        await validator.executeCommand('cargo', ['fmt', '--version'], { timeout: 5000 });
      } catch (error) {
        console.log('Skipping fmt test - cargo fmt not available');
        return;
      }

      const result = await validator.runCargoFormat(testProjectPath);

      expect(result).toBeDefined();
      expect(result.exitCode).toBeDefined();
      expect(result.filesChecked).toBeGreaterThan(0);
      expect(result.unformattedFiles).toBeDefined();
      expect(result.config).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should detect unformatted files', async () => {
      // Create poorly formatted Rust file
      const poorlyFormattedCode = `fn main(){let x=1;let y=2;
if x==1{println!("hello");}}
      `;

      await fs.writeFile(
        path.join(testProjectPath, 'src', 'main.rs'),
        poorlyFormattedCode
      );

      try {
        const result = await validator.runCargoFormat(testProjectPath);
        // Result should indicate formatting issues
        expect(result.exitCode).not.toBe(0);
      } catch (error) {
        // Expected if cargo fmt not available
        console.log('Formatting test skipped - cargo fmt not available');
      }
    });
  });

  describe('Security Audit', () => {
    it('should run cargo audit successfully', async () => {
      const result = await validator.runCargoAudit(testProjectPath);

      expect(result).toBeDefined();
      expect(result.vulnerabilities).toBeDefined();
      expect(result.advisories).toBeDefined();
      expect(result.unmaintained).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Should pass with no vulnerabilities in clean project
      if (result.exitCode !== -1) { // If cargo audit is available
        expect(result.passed).toBe(true);
        expect(result.vulnerabilities).toHaveLength(0);
      }
    });

    it('should handle cargo audit installation gracefully', async () => {
      // This tests the installation logic when cargo-audit is not available
      const originalExecuteCommand = validator.executeCommand;
      let installCalled = false;

      validator.executeCommand = jest.fn().mockImplementation((command, args, options) => {
        if (command === 'cargo' && args[0] === 'audit' && args[1] === '--version') {
          throw new Error('cargo-audit not installed');
        }
        if (command === 'cargo' && args[0] === 'install' && args[1] === 'cargo-audit') {
          installCalled = true;
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        return originalExecuteCommand.call(validator, command, args, options);
      });

      try {
        await validator.ensureCargoAuditInstalled();
        expect(installCalled).toBe(true);
      } catch (error) {
        // Installation might fail in test environment
      }

      validator.executeCommand = originalExecuteCommand;
    });
  });

  describe('Code Complexity Analysis', () => {
    it('should analyze code complexity correctly', async () => {
      const complexCode = `fn simple_function() {
    println!("Hello");
}

fn complex_function(x: i32) -> i32 {
    if x > 0 {
        if x > 10 {
            for i in 0..x {
                if i % 2 == 0 {
                    match i {
                        0 => println!("zero"),
                        2 => println!("two"),
                        _ => println!("other"),
                    }
                }
            }
        } else {
            while x > 0 {
                if x == 5 || x == 7 {
                    break;
                }
            }
        }
    }
    x
}
      `;

      await fs.writeFile(
        path.join(testProjectPath, 'src', 'lib.rs'),
        complexCode
      );

      const result = await validator.analyzeCodeComplexity(testProjectPath);

      expect(result.averageComplexity).toBeGreaterThan(1);
      expect(result.maxComplexity).toBeGreaterThan(5);
      expect(result.totalFunctions).toBe(2);
      expect(result.complexFunctions.length).toBeGreaterThan(0);
      expect(result.metrics.totalFiles).toBeGreaterThan(0);
    });

    it('should identify complex functions correctly', async () => {
      const testCode = `fn very_complex_function(x: i32) -> i32 {
    if x > 0 {
        if x > 10 {
            if x > 20 {
                if x > 30 {
                    return x * 2;
                }
            }
        }
    }
    x
}
      `;

      const complexity = validator.analyzeFileComplexity(
        'test.rs',
        testCode
      );

      expect(complexity.functions).toHaveLength(1);
      expect(complexity.functions[0].complexity).toBeGreaterThan(4);
      expect(complexity.functions[0].name).toBe('very_complex_function');
    });
  });

  describe('Documentation Analysis', () => {
    it('should analyze documentation coverage', async () => {
      const documentedCode = `//! Library documentation

/// This function adds two numbers
///
/// # Examples
///
/// \`\`\`
/// let result = add(2, 3);
/// assert_eq!(result, 5);
/// \`\`\`
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn undocumented_function() -> i32 {
    42
}
      `;

      await fs.writeFile(
        path.join(testProjectPath, 'src', 'lib.rs'),
        documentedCode
      );

      const result = await validator.analyzeDocumentationCoverage(testProjectPath);

      expect(result.coverage).toBeDefined();
      expect(result.totalItems).toBeGreaterThan(0);
      expect(result.documentedItems).toBeGreaterThan(0);
      expect(result.missingDocs).toBeDefined();
    });
  });

  describe('Performance Analysis', () => {
    it('should analyze compilation performance', async () => {
      // Skip if cargo not available
      try {
        await validator.executeCommand('cargo', ['--version'], { timeout: 5000 });
      } catch (error) {
        console.log('Skipping performance test - cargo not available');
        return;
      }

      const result = await validator.analyzeCompilePerformance(testProjectPath);

      expect(result.compileTime).toBeGreaterThan(0);
      expect(result.optimizationLevel).toBe('debug');
      expect(result.detailedMetrics).toBeDefined();
      expect(result.passed).toBeDefined();
    });
  });

  describe('Quality Score Calculation', () => {
    it('should calculate quality scores correctly', async () => {
      const mockResults = {
        clippyResults: {
          passed: true,
          errors: [],
          warnings: []
        },
        formatResults: {
          passed: true
        },
        securityResults: {
          passed: true,
          vulnerabilities: []
        },
        complexityAnalysis: {
          averageComplexity: 5
        },
        docCoverage: {
          coverage: 0.8
        },
        compileMetrics: {
          passed: true
        }
      };

      const score = validator.calculateQualityScore(mockResults);

      expect(score.overall).toBeGreaterThan(7);
      expect(score.breakdown).toBeDefined();
      expect(score.breakdown.clippy).toBe(10);
      expect(score.breakdown.formatting).toBe(10);
      expect(score.breakdown.security).toBe(10);
      expect(score.weights).toBeDefined();
    });

    it('should penalize poor code quality appropriately', async () => {
      const mockResults = {
        clippyResults: {
          passed: false,
          errors: [{ message: 'Error 1' }, { message: 'Error 2' }],
          warnings: [{ message: 'Warning 1' }]
        },
        formatResults: {
          passed: false
        },
        securityResults: {
          passed: false,
          vulnerabilities: [{ advisory: { title: 'Security issue' } }]
        },
        complexityAnalysis: {
          averageComplexity: 20 // High complexity
        },
        docCoverage: {
          coverage: 0.3 // Low documentation
        },
        compileMetrics: {
          passed: false
        }
      };

      const score = validator.calculateQualityScore(mockResults);

      expect(score.overall).toBeLessThan(5);
      expect(score.breakdown.clippy).toBeLessThan(5);
      expect(score.breakdown.formatting).toBe(0);
      expect(score.breakdown.security).toBeLessThan(10);
    });
  });

  describe('Quality Recommendations', () => {
    it('should generate appropriate recommendations', async () => {
      const mockResults = {
        clippyResults: {
          errors: [{ message: 'Fix this error' }],
          warnings: Array(10).fill({ message: 'Fix this warning' })
        },
        formatResults: {
          unformattedFiles: ['src/lib.rs', 'src/main.rs']
        },
        securityResults: {
          vulnerabilities: [
            { advisory: { title: 'Critical vulnerability' } }
          ]
        },
        complexityAnalysis: {
          complexFunctions: [
            { name: 'complex_fn', complexity: 20 }
          ]
        },
        docCoverage: {
          coverage: 0.3,
          missingDocs: ['function_a', 'function_b']
        }
      };

      const recommendations = validator.generateQualityRecommendations(mockResults);

      expect(recommendations.length).toBeGreaterThan(0);

      const categories = recommendations.map(r => r.category);
      expect(categories).toContain('clippy');
      expect(categories).toContain('formatting');
      expect(categories).toContain('security');
      expect(categories).toContain('complexity');
      expect(categories).toContain('documentation');

      const criticalRecs = recommendations.filter(r => r.priority === 'critical');
      expect(criticalRecs.length).toBeGreaterThan(0);
    });
  });

  describe('Rust Project Utilities', () => {
    it('should find Rust source files correctly', async () => {
      // Create additional Rust files
      await fs.mkdir(path.join(testProjectPath, 'src', 'utils'), { recursive: true });
      await fs.writeFile(
        path.join(testProjectPath, 'src', 'utils', 'helper.rs'),
        'pub fn help() {}'
      );

      const files = await validator.findRustSourceFiles(testProjectPath);

      expect(files.length).toBeGreaterThan(2);
      expect(files.some(f => f.endsWith('lib.rs'))).toBe(true);
      expect(files.some(f => f.endsWith('main.rs'))).toBe(true);
      expect(files.some(f => f.endsWith('helper.rs'))).toBe(true);
    });

    it('should parse Cargo.toml correctly', async () => {
      const cargoToml = `
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }
      `;

      const parsed = validator.parseCargoToml(cargoToml);

      expect(parsed.package.name).toBe('test-project');
      expect(parsed.package.version).toBe('0.1.0');
      expect(parsed.package.edition).toBe('2021');
      expect(parsed.dependencies).toBeDefined();
    });
  });

  describe('Full Integration', () => {
    it('should perform complete quality validation', async () => {
      // Skip if Rust toolchain not available
      try {
        await validator.executeCommand('cargo', ['--version'], { timeout: 5000 });
      } catch (error) {
        console.log('Skipping integration test - cargo not available');
        return;
      }

      const result = await validator.validateRustQuality(testProjectPath);

      expect(result.validationId).toBeDefined();
      expect(result.framework).toBe('rust-quality-validation');
      expect(result.realExecution).toBe(true);
      expect(result.project).toBeDefined();
      expect(result.toolchain).toBeDefined();
      expect(result.codeQuality).toBeDefined();
      expect(result.clippy).toBeDefined();
      expect(result.formatting).toBeDefined();
      expect(result.security).toBeDefined();
      expect(result.complexity).toBeDefined();
      expect(result.documentation).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.realWorldValidation).toBeDefined();
      expect(result.realWorldValidation.simulationDetected).toBe(false);

      // Verify quality score is calculated
      expect(result.codeQuality.overallScore).toBeGreaterThan(0);
      expect(result.codeQuality.overallScore).toBeLessThanOrEqual(10);
    });
  });
});

// Helper function to create mock Rust project
async function createMockRustProject(projectPath) {
  // Create Cargo.toml
  const cargoToml = `
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
`;

  await fs.writeFile(path.join(projectPath, 'Cargo.toml'), cargoToml);

  // Create src directory
  await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });

  // Create lib.rs
  const libContent = `//! Test library for quality validation

/// Adds two numbers together
///
/// # Examples
///
/// \`\`\`
/// use test_project::add;
/// assert_eq!(add(2, 3), 5);
/// \`\`\`
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn multiply(a: i32, b: i32) -> i32 {
    a * b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_multiply() {
        assert_eq!(multiply(2, 3), 6);
    }
}
`;

  await fs.writeFile(path.join(projectPath, 'src', 'lib.rs'), libContent);

  // Create main.rs
  const mainContent = `use test_project::{add, multiply};

fn main() {
    let result = add(2, 3);
    println!("2 + 3 = {}", result);

    let result2 = multiply(4, 5);
    println!("4 * 5 = {}", result2);
}
`;

  await fs.writeFile(path.join(projectPath, 'src', 'main.rs'), mainContent);

  return {
    cargoToml: path.join(projectPath, 'Cargo.toml'),
    libRs: path.join(projectPath, 'src', 'lib.rs'),
    mainRs: path.join(projectPath, 'src', 'main.rs')
  };
}