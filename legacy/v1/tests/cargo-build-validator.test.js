/**
 * Test suite for Cargo Build Validator
 * Tests real Cargo command execution and validation functionality
 */

import { jest } from '@jest/globals';
import { CargoBuildValidator } from '../src/validation/real-world-validators/cargo-build-validator.js';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

describe('CargoBuildValidator', () => {
  let validator;
  let mockProjectPath;

  beforeEach(() => {
    validator = new CargoBuildValidator({
      timeout: 30000,
      enableByzantineValidation: true,
      buildModes: ['debug'],
      enableClipper: false, // Disable for tests to avoid dependency issues
      enableCrossCompilation: false
    });

    mockProjectPath = '/tmp/test-rust-project';
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const defaultValidator = new CargoBuildValidator();

      expect(defaultValidator.options.timeout).toBe(900000);
      expect(defaultValidator.options.enableByzantineValidation).toBe(true);
      expect(defaultValidator.options.buildModes).toEqual(['debug', 'release']);
      expect(defaultValidator.options.enableClipper).toBe(true);
    });

    it('should accept custom options', () => {
      const customValidator = new CargoBuildValidator({
        timeout: 60000,
        buildModes: ['debug'],
        enableClipper: false
      });

      expect(customValidator.options.timeout).toBe(60000);
      expect(customValidator.options.buildModes).toEqual(['debug']);
      expect(customValidator.options.enableClipper).toBe(false);
    });
  });

  describe('parseCargoToml', () => {
    it('should parse basic Cargo.toml structure', () => {
      const cargoTomlContent = `
[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
tokio-test = "0.4"
`;

      const parsed = validator.parseCargoToml(cargoTomlContent);

      expect(parsed.package.name).toBe('test-project');
      expect(parsed.package.version).toBe('0.1.0');
      expect(parsed.package.edition).toBe('2021');
      expect(parsed.dependencies.serde).toBe('1.0');
      expect(parsed['dev-dependencies']['tokio-test']).toBe('0.4');
    });

    it('should handle workspace configuration', () => {
      const workspaceToml = `
[workspace]
members = ["crate-a", "crate-b"]

[workspace.dependencies]
common-dep = "1.0"
`;

      const parsed = validator.parseCargoToml(workspaceToml);

      expect(parsed.workspace.members).toBeDefined();
      expect(parsed.workspace.dependencies).toBeDefined();
    });
  });

  describe('analyzeCargoDependencies', () => {
    it('should extract different dependency types', () => {
      const cargoProject = {
        dependencies: { serde: '1.0', tokio: '1.0' },
        'dev-dependencies': { 'tokio-test': '0.4' },
        'build-dependencies': { 'build-helper': '0.1' }
      };

      const analysis = validator.analyzeCargoDependencies(cargoProject);

      expect(analysis.dependencies).toEqual(['serde', 'tokio']);
      expect(analysis.devDependencies).toEqual(['tokio-test']);
      expect(analysis.buildDependencies).toEqual(['build-helper']);
    });

    it('should handle empty dependency sections', () => {
      const cargoProject = {};
      const analysis = validator.analyzeCargoDependencies(cargoProject);

      expect(analysis.dependencies).toEqual([]);
      expect(analysis.devDependencies).toEqual([]);
      expect(analysis.buildDependencies).toEqual([]);
    });
  });

  describe('parseCargoBuildOutput', () => {
    it('should extract compilation metrics from build output', () => {
      const output = `
   Compiling proc-macro2 v1.0.47
   Compiling unicode-ident v1.0.5
   Compiling syn v1.0.105
   Compiling serde v1.0.147
warning: unused variable \`x\`
   Compiling test-project v0.1.0
    Finished dev [unoptimized + debuginfo] target(s) in 5.23s
`;

      const metrics = validator.parseCargoBuildOutput(output, '');

      expect(metrics.compilationUnits).toBe(5);
      expect(metrics.warnings).toBe(1);
      expect(metrics.errors).toBe(0);
      expect(metrics.compilationTime).toBe(5230); // 5.23s in ms
    });

    it('should handle build errors', () => {
      const output = `
   Compiling test-project v0.1.0
error[E0425]: cannot find value \`undefined_var\` in this scope
error: aborting due to previous error
`;

      const metrics = validator.parseCargoBuildOutput(output, '');

      expect(metrics.errors).toBe(1); // Only matches "error:" pattern, not "error[E0425]:"
      expect(metrics.compilationUnits).toBe(1);
    });
  });

  describe('parseCargoCheckOutput', () => {
    it('should extract check metrics', () => {
      const output = `
    Checking proc-macro2 v1.0.47
    Checking unicode-ident v1.0.5
    Checking syn v1.0.105
warning: unused import: \`std::collections::HashMap\`
    Checking test-project v0.1.0
    Finished dev [unoptimized + debuginfo] target(s) in 2.45s
`;

      const metrics = validator.parseCargoCheckOutput(output, '');

      expect(metrics.compilationUnits).toBe(4);
      expect(metrics.warnings).toBe(1);
      expect(metrics.errors).toBe(0);
    });
  });

  describe('parseClippyOutput', () => {
    it('should extract lint violations', () => {
      const output = `
warning: using \`.unwrap()\` on a \`Result\` value
  --> src/main.rs:5:13
   |
5  |     let x = result.unwrap();
   |             ^^^^^^^^^^^^^^^
   |
   = note: \`#[warn(clippy::unwrap_used)]\` on by default
   = help: for further information visit https://rust-lang.github.io/rust-clippy/master/index.html#unwrap_used

error: you seem to be trying to use \`match\` for destructuring a single pattern
  --> src/main.rs:10:5
   |
10 |     match value {
   |     ^^^^^^^^^^^^^
   |
   = note: \`#[deny(clippy::single_match)]\` on by default
`;

      const metrics = validator.parseClippyOutput(output, '');

      expect(metrics.warnings).toBe(1);
      expect(metrics.errors).toBe(1);
      expect(metrics.lintViolations).toHaveLength(2);

      const unwrapViolation = metrics.lintViolations.find(v => v.lint.includes('unwrap_used'));
      expect(unwrapViolation).toBeDefined();
      expect(unwrapViolation.severity).toBe('warning');
    });
  });

  describe('determineArtifactType', () => {
    it('should correctly identify artifact types', () => {
      expect(validator.determineArtifactType('/path/to/binary.exe')).toBe('binary');
      expect(validator.determineArtifactType('/path/to/binary')).toBe('binary');
      expect(validator.determineArtifactType('/path/to/lib.dll')).toBe('dynamic_library');
      expect(validator.determineArtifactType('/path/to/lib.so')).toBe('dynamic_library');
      expect(validator.determineArtifactType('/path/to/lib.a')).toBe('static_library');
      expect(validator.determineArtifactType('/path/to/lib.rlib')).toBe('static_library');
    });
  });

  describe('analyzeCargoPerformance', () => {
    it('should calculate performance metrics from build results', () => {
      const buildResults = [
        {
          success: true,
          duration: 5000,
          metrics: { compilationUnits: 10, parallelJobs: 4 }
        },
        {
          success: true,
          duration: 3000,
          metrics: { compilationUnits: 8, parallelJobs: 2 }
        },
        {
          success: false,
          duration: 1000
        }
      ];

      const checkResults = { duration: 2000 };

      const metrics = validator.analyzeCargoPerformance(buildResults, checkResults);

      expect(metrics.totalBuildTime).toBe(8000); // Only successful builds
      expect(metrics.averageBuildTime).toBe(4000);
      expect(metrics.compilationUnits).toBe(18);
      expect(metrics.parallelization).toBe(4); // Max parallel jobs
      expect(metrics.checkTime).toBe(2000);
      expect(metrics.compilationSpeed).toBeCloseTo(2.25); // 18 units / 8 seconds
    });

    it('should handle empty build results', () => {
      const metrics = validator.analyzeCargoPerformance([], { duration: 1000 });

      expect(metrics.totalBuildTime).toBe(0);
      expect(metrics.averageBuildTime).toBe(0);
      expect(metrics.compilationSpeed).toBe(0);
      expect(metrics.checkTime).toBe(1000);
    });
  });

  describe('evaluateCargoPerformanceThresholds', () => {
    it('should evaluate performance against thresholds', () => {
      const performanceMetrics = {
        totalBuildTime: 300000, // 5 minutes
        maxMemoryUsage: 1000000000, // 1GB
        compilationUnits: 500
      };

      const evaluation = validator.evaluateCargoPerformanceThresholds(performanceMetrics);

      expect(evaluation.buildTime).toBe(true); // Under 10 minute threshold
      expect(evaluation.memoryUsage).toBe(true); // Under 2GB threshold
      expect(evaluation.compilationUnits).toBe(true); // Under 1000 threshold
      expect(evaluation.overallPerformance).toBe(true);
    });

    it('should detect threshold violations', () => {
      const performanceMetrics = {
        totalBuildTime: 700000, // 11.67 minutes
        maxMemoryUsage: 3000000000, // 3GB
        compilationUnits: 1500
      };

      const evaluation = validator.evaluateCargoPerformanceThresholds(performanceMetrics);

      expect(evaluation.buildTime).toBe(false);
      expect(evaluation.memoryUsage).toBe(false);
      expect(evaluation.compilationUnits).toBe(false);
      expect(evaluation.overallPerformance).toBe(false);
    });
  });

  describe('generateCargoValidators', () => {
    it('should generate appropriate number of validators', () => {
      const validationData = {
        cargoProject: { isWorkspace: false },
        buildResults: [{ success: true }]
      };

      const validators = validator.generateCargoValidators(validationData);

      expect(validators.length).toBeGreaterThanOrEqual(8);
      expect(validators[0]).toHaveProperty('id');
      expect(validators[0]).toHaveProperty('specialization');
      expect(validators[0]).toHaveProperty('reputation');
      expect(validators[0]).toHaveProperty('riskTolerance');
    });

    it('should increase validator count for complex projects', () => {
      const simpleProject = {
        cargoProject: { isWorkspace: false },
        buildResults: [{ success: true }]
      };

      const workspaceProject = {
        cargoProject: { isWorkspace: true },
        buildResults: [{ success: false }]
      };

      const simpleValidators = validator.generateCargoValidators(simpleProject);
      const workspaceValidators = validator.generateCargoValidators(workspaceProject);

      expect(workspaceValidators.length).toBeGreaterThan(simpleValidators.length);
    });
  });

  describe('extractCargoErrors', () => {
    it('should extract errors from all result types', () => {
      const buildResults = [
        { success: false, mode: 'debug', error: 'Build failed', stderr: 'compilation error' },
        { success: true, mode: 'release' }
      ];

      const checkResults = { success: false, error: 'Check failed', stderr: 'check error' };
      const clippyResults = { enabled: true, success: false, error: 'Clippy failed', stderr: 'lint error' };

      const errors = validator.extractCargoErrors(buildResults, checkResults, clippyResults);

      expect(errors).toHaveLength(3);
      expect(errors[0].type).toBe('build');
      expect(errors[1].type).toBe('check');
      expect(errors[2].type).toBe('clippy');
    });
  });

  describe('calculateCargoFalseCompletionRate', () => {
    beforeEach(() => {
      validator.buildHistory.clear();
    });

    it('should calculate false completion rate', () => {
      // Add some build history
      validator.buildHistory.set('build1', {
        builds: { overallSuccess: true },
        artifacts: { integrityPassed: true },
        dependencies: { securityPassed: true },
        performance: { meetsThresholds: { overallPerformance: true } }
      });

      validator.buildHistory.set('build2', {
        builds: { overallSuccess: true },
        artifacts: { integrityPassed: false }, // False completion
        dependencies: { securityPassed: true },
        performance: { meetsThresholds: { overallPerformance: true } }
      });

      const rate = validator.calculateCargoFalseCompletionRate();

      expect(rate.rate).toBe(0.5);
      expect(rate.sample).toBe(2);
      expect(rate.falseCompletions).toBe(1);
    });

    it('should return zero rate for no builds', () => {
      const rate = validator.calculateCargoFalseCompletionRate();

      expect(rate.rate).toBe(0);
      expect(rate.sample).toBe(0);
      expect(rate.falseCompletions).toBe(0);
    });
  });

  describe('generateValidationId', () => {
    it('should generate unique validation IDs', () => {
      const id1 = validator.generateValidationId();
      const id2 = validator.generateValidationId();

      expect(id1).toMatch(/^cargo_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^cargo_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateCargoExecutionHash', () => {
    it('should generate consistent hashes for same data', () => {
      const validationData = {
        cargoProject: { name: 'test' },
        buildResults: [{ mode: 'debug', success: true, duration: 1000 }],
        checkResults: { success: true, warnings: 0 },
        artifactValidation: { binaries: [], integrityPassed: true }
      };

      const hash1 = validator.generateCargoExecutionHash(validationData);
      const hash2 = validator.generateCargoExecutionHash(validationData);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate different hashes for different data', () => {
      const data1 = {
        cargoProject: { name: 'test1' },
        buildResults: [],
        checkResults: {},
        artifactValidation: {}
      };

      const data2 = {
        cargoProject: { name: 'test2' },
        buildResults: [],
        checkResults: {},
        artifactValidation: {}
      };

      const hash1 = validator.generateCargoExecutionHash(data1);
      const hash2 = validator.generateCargoExecutionHash(data2);

      expect(hash1).not.toBe(hash2);
    });
  });
});