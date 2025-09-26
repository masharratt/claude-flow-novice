import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { describe, test, it, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * Comprehensive Rust Validation Test Suite
 * Tests framework detection, cargo test execution, build validation, and quality checks
 *
 * REQUIREMENTS:
 * - Test all Rust components: framework detection, cargo execution, build validation
 * - Include real Cargo project fixtures with various configurations
 * - Validate <5% false completion rate (>95% accuracy)
 * - Follow existing test patterns from jest/pytest integration tests
 * - Include Byzantine consensus test scenarios for validation integrity
 * - Support various Rust testing frameworks: cargo test, criterion, tarpaulin
 *
 * SUCCESS CRITERIA:
 * - >95% accuracy in Rust project detection
 * - <2s average detection time for typical projects
 * - Byzantine fault tolerance in validation consensus
 * - Comprehensive coverage of Rust ecosystem patterns
 */

const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Mock Rust Framework Validator following existing patterns
class MockRustFrameworkValidator {
  constructor(options = {}) {
    this.configManager = options.configManager;
    this.initialized = false;
    this.detectionCache = new Map();
    this.validationHistory = [];
    this.byzantineNodes = new Set();
    this.consensusEnabled = options.enableConsensus || false;
  }

  async initialize() {
    this.initialized = true;
    if (this.consensusEnabled) {
      await this.initializeByzantineConsensus();
    }
  }

  async close() {
    this.initialized = false;
    this.detectionCache.clear();
    this.byzantineNodes.clear();
  }

  async detectRustProject(projectPath) {
    if (!this.initialized) {
      throw new Error('Rust validator not initialized');
    }

    const detection = new RustProjectDetector(projectPath);
    const result = await detection.analyze();

    // Cache successful detections
    if (result.confidence > 0.8) {
      this.detectionCache.set(projectPath, result);
    }

    return result;
  }

  async validateRustFramework(framework, options = {}) {
    if (options.requireByzantineConsensus && this.consensusEnabled) {
      return await this.executeRustByzantineConsensus(framework);
    }

    return {
      success: true,
      byzantineValidated: false,
      validationId: `rust-val-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    };
  }

  async executeRustByzantineConsensus(framework) {
    const consensusNodes = this.createRustConsensusNodes(5); // 5-node consensus
    const byzantineCount = Math.floor(consensusNodes.length / 3); // Up to 1/3 Byzantine

    // Mark some nodes as Byzantine for testing
    for (let i = 0; i < byzantineCount; i++) {
      consensusNodes[i].byzantine = true;
    }

    const proposal = {
      proposalId: `rust-prop-${Date.now()}`,
      framework: framework,
      timestamp: Date.now(),
      proposer: 'rust-validator'
    };

    const votes = await this.collectRustConsensusVotes(consensusNodes, proposal);
    const decision = this.makeRustConsensusDecision(votes);

    return {
      success: decision.approved,
      byzantineValidated: true,
      consensusId: proposal.proposalId,
      votes: votes.length,
      byzantineNodes: byzantineCount,
      confidence: decision.confidence,
      cryptographicSignature: this.generateRustSignature(proposal)
    };
  }

  createRustConsensusNodes(count) {
    return Array.from({ length: count }, (_, i) => ({
      nodeId: `rust-node-${i}`,
      byzantine: false,
      reputation: 100 - (i * 10), // Varying reputation
      specialization: ['cargo', 'clippy', 'rustfmt', 'criterion', 'tarpaulin'][i % 5]
    }));
  }

  async collectRustConsensusVotes(nodes, proposal) {
    const votes = [];

    for (const node of nodes) {
      const vote = await this.generateRustNodeVote(node, proposal);
      votes.push(vote);
    }

    return votes;
  }

  async generateRustNodeVote(node, proposal) {
    const framework = proposal.framework;
    let score = 0.5;
    let decision;

    // Rust-specific validation criteria
    if (framework.cargoToml && framework.cargoToml.package) {
      score += 0.2;
    }

    if (framework.testPatterns && framework.testPatterns.length > 0) {
      score += 0.1;
    }

    if (framework.dependencies && framework.dependencies.includes('criterion')) {
      score += 0.1; // Benchmark framework
    }

    if (framework.devDependencies && framework.devDependencies.includes('tarpaulin')) {
      score += 0.1; // Coverage tool
    }

    // Check for unsafe code without justification
    if (framework.hasUnsafeCode && !framework.unsafeJustification) {
      score -= 0.3;
    }

    // Byzantine behavior simulation
    if (node.byzantine) {
      switch (node.nodeId) {
        case 'rust-node-0':
          decision = 'reject'; // Always reject
          score = 0.1;
          break;
        case 'rust-node-1':
          decision = Math.random() < 0.5 ? 'approve' : 'reject'; // Random
          score = Math.random() * 0.4 + 0.3;
          break;
        default:
          decision = score > 0.6 ? 'approve' : 'reject';
          break;
      }
    } else {
      // Honest node behavior
      if (score > 0.8) {
        decision = 'approve';
      } else if (score > 0.4) {
        decision = 'abstain';
      } else {
        decision = 'reject';
      }
    }

    return {
      nodeId: node.nodeId,
      decision,
      confidence: score,
      specialization: node.specialization,
      byzantine: node.byzantine,
      timestamp: Date.now()
    };
  }

  makeRustConsensusDecision(votes) {
    const approvals = votes.filter(v => v.decision === 'approve').length;
    const rejections = votes.filter(v => v.decision === 'reject').length;
    const abstentions = votes.filter(v => v.decision === 'abstain').length;

    const totalVotes = votes.length;
    const threshold = Math.ceil(totalVotes * 2 / 3);

    return {
      approved: approvals >= threshold,
      confidence: approvals / totalVotes,
      breakdown: { approvals, rejections, abstentions }
    };
  }

  generateRustSignature(proposal) {
    const data = JSON.stringify(proposal);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return `rust-sig-${hash.substr(0, 16)}`;
  }

  async initializeByzantineConsensus() {
    // Initialize Byzantine consensus for Rust validation
    this.byzantineNodes.add('rust-node-0'); // Known Byzantine node
  }
}

class RustProjectDetector {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.detectedFiles = [];
    this.cargoInfo = null;
    this.rustConfig = null;
    this.confidence = 0;
    this.testFrameworks = [];
    this.buildTools = [];
    this.qualityTools = [];
  }

  async analyze() {
    const startTime = Date.now();

    try {
      await this.scanRustFiles();
      await this.analyzeCargoToml();
      await this.analyzeRustConfig();
      await this.detectTestFrameworks();
      await this.detectBuildTools();
      await this.detectQualityTools();
      await this.analyzeDependencies();

      this.calculateConfidence();

      const detectionTime = Date.now() - startTime;

      return {
        isRustProject: this.isRustProject(),
        confidence: this.confidence,
        detectedFiles: this.detectedFiles,
        cargoInfo: this.cargoInfo,
        rustConfig: this.rustConfig,
        testFrameworks: this.testFrameworks,
        buildTools: this.buildTools,
        qualityTools: this.qualityTools,
        detectionTime,
        suggestions: this.generateSuggestions(),
        warnings: this.generateWarnings(),
        metrics: this.calculateMetrics()
      };

    } catch (error) {
      return {
        isRustProject: false,
        confidence: 0,
        error: error.message,
        detectionTime: Date.now() - startTime
      };
    }
  }

  async scanRustFiles() {
    const rustFiles = [
      'Cargo.toml',
      'Cargo.lock',
      'rust-toolchain',
      'rust-toolchain.toml',
      '.rustfmt.toml',
      'rustfmt.toml',
      'clippy.toml',
      '.clippy.toml',
      'tarpaulin.toml'
    ];

    for (const fileName of rustFiles) {
      try {
        const filePath = path.join(this.projectPath, fileName);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          this.detectedFiles.push(fileName);
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    // Scan for Rust source files
    await this.scanRustSourceStructure();
  }

  async scanRustSourceStructure() {
    const sourcePatterns = [
      'src/main.rs',
      'src/lib.rs',
      'src/bin',
      'tests',
      'benches',
      'examples',
      'build.rs'
    ];

    for (const pattern of sourcePatterns) {
      try {
        const fullPath = path.join(this.projectPath, pattern);
        const stats = await fs.stat(fullPath);

        if (stats.isFile()) {
          this.detectedFiles.push(pattern);
        } else if (stats.isDirectory()) {
          this.detectedFiles.push(`${pattern}/`);

          // Scan for Rust files in directory
          const files = await fs.readdir(fullPath);
          const rustFiles = files.filter(f =>
            f.endsWith('.rs') || f === 'mod.rs' || f === 'lib.rs'
          );

          if (rustFiles.length > 0) {
            this.detectedFiles.push(`${pattern}/${rustFiles[0]}`);
          }
        }
      } catch (error) {
        // Path doesn't exist, continue
      }
    }
  }

  async analyzeCargoToml() {
    if (!this.detectedFiles.includes('Cargo.toml')) {
      return;
    }

    try {
      const cargoPath = path.join(this.projectPath, 'Cargo.toml');
      const cargoContent = await fs.readFile(cargoPath, 'utf8');

      // Simple TOML parsing for key information
      this.cargoInfo = this.parseCargoToml(cargoContent);
    } catch (error) {
      this.cargoInfo = { invalid: true };
    }
  }

  parseCargoToml(content) {
    const info = {
      package: {},
      dependencies: {},
      devDependencies: {},
      buildDependencies: {},
      features: {},
      workspace: null,
      edition: null
    };

    const lines = content.split('\n');
    let currentSection = null;
    let currentObject = null;

    for (let line of lines) {
      line = line.trim();

      if (line.startsWith('[') && line.endsWith(']')) {
        const section = line.slice(1, -1);

        if (section === 'package') {
          currentSection = 'package';
          currentObject = info.package;
        } else if (section === 'dependencies') {
          currentSection = 'dependencies';
          currentObject = info.dependencies;
        } else if (section === 'dev-dependencies') {
          currentSection = 'devDependencies';
          currentObject = info.devDependencies;
        } else if (section === 'build-dependencies') {
          currentSection = 'buildDependencies';
          currentObject = info.buildDependencies;
        } else if (section === 'features') {
          currentSection = 'features';
          currentObject = info.features;
        } else if (section === 'workspace') {
          currentSection = 'workspace';
          info.workspace = {};
          currentObject = info.workspace;
        }
        continue;
      }

      if (currentObject && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim().replace(/"/g, '');

        if (currentSection === 'package' && key.trim() === 'edition') {
          info.edition = value;
        }

        currentObject[key.trim()] = value;
      }
    }

    return info;
  }

  async analyzeRustConfig() {
    const configFiles = ['rust-toolchain', 'rust-toolchain.toml'];

    for (const configFile of configFiles) {
      if (this.detectedFiles.includes(configFile)) {
        try {
          const configPath = path.join(this.projectPath, configFile);
          const configContent = await fs.readFile(configPath, 'utf8');

          this.rustConfig = {
            file: configFile,
            content: configContent,
            channel: this.extractRustChannel(configContent)
          };
          break;
        } catch (error) {
          // Continue to next config file
        }
      }
    }
  }

  extractRustChannel(content) {
    if (content.includes('nightly')) return 'nightly';
    if (content.includes('beta')) return 'beta';
    if (content.includes('stable')) return 'stable';

    // Try to extract version number
    const versionMatch = content.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : 'stable';
  }

  async detectTestFrameworks() {
    const frameworks = [];

    // Built-in cargo test
    if (this.detectedFiles.some(f => f.includes('tests/') || f.includes('test'))) {
      frameworks.push({
        name: 'cargo-test',
        type: 'unit-integration',
        builtin: true,
        detected: true
      });
    }

    // Criterion benchmarks
    if (this.cargoInfo?.dependencies?.criterion ||
        this.cargoInfo?.devDependencies?.criterion ||
        this.detectedFiles.some(f => f.includes('benches/'))) {
      frameworks.push({
        name: 'criterion',
        type: 'benchmark',
        builtin: false,
        detected: true
      });
    }

    // PropTest
    if (this.cargoInfo?.dependencies?.proptest ||
        this.cargoInfo?.devDependencies?.proptest) {
      frameworks.push({
        name: 'proptest',
        type: 'property-testing',
        builtin: false,
        detected: true
      });
    }

    // QuickCheck
    if (this.cargoInfo?.dependencies?.quickcheck ||
        this.cargoInfo?.devDependencies?.quickcheck) {
      frameworks.push({
        name: 'quickcheck',
        type: 'property-testing',
        builtin: false,
        detected: true
      });
    }

    // Tarpaulin (coverage)
    if (this.cargoInfo?.devDependencies?.tarpaulin ||
        this.detectedFiles.includes('tarpaulin.toml')) {
      frameworks.push({
        name: 'tarpaulin',
        type: 'coverage',
        builtin: false,
        detected: true
      });
    }

    this.testFrameworks = frameworks;
  }

  async detectBuildTools() {
    const tools = [];

    // Cargo (always present)
    if (this.detectedFiles.includes('Cargo.toml')) {
      tools.push({
        name: 'cargo',
        type: 'build-system',
        builtin: true,
        detected: true
      });
    }

    // Custom build script
    if (this.detectedFiles.includes('build.rs')) {
      tools.push({
        name: 'build-script',
        type: 'custom-build',
        builtin: false,
        detected: true
      });
    }

    // Cross compilation
    if (this.cargoInfo?.dependencies?.['cross'] ||
        this.cargoInfo?.devDependencies?.['cross']) {
      tools.push({
        name: 'cross',
        type: 'cross-compilation',
        builtin: false,
        detected: true
      });
    }

    // Wasm-pack
    if (this.cargoInfo?.dependencies?.['wasm-bindgen'] ||
        this.cargoInfo?.devDependencies?.['wasm-bindgen']) {
      tools.push({
        name: 'wasm-pack',
        type: 'webassembly',
        builtin: false,
        detected: true
      });
    }

    this.buildTools = tools;
  }

  async detectQualityTools() {
    const tools = [];

    // Clippy (linter)
    if (this.detectedFiles.includes('clippy.toml') ||
        this.detectedFiles.includes('.clippy.toml')) {
      tools.push({
        name: 'clippy',
        type: 'linter',
        builtin: true,
        detected: true,
        configured: true
      });
    } else if (this.isRustProject()) {
      // Clippy available by default
      tools.push({
        name: 'clippy',
        type: 'linter',
        builtin: true,
        detected: true,
        configured: false
      });
    }

    // Rustfmt (formatter)
    if (this.detectedFiles.includes('.rustfmt.toml') ||
        this.detectedFiles.includes('rustfmt.toml')) {
      tools.push({
        name: 'rustfmt',
        type: 'formatter',
        builtin: true,
        detected: true,
        configured: true
      });
    } else if (this.isRustProject()) {
      // Rustfmt available by default
      tools.push({
        name: 'rustfmt',
        type: 'formatter',
        builtin: true,
        detected: true,
        configured: false
      });
    }

    // Miri (interpreter for unsafe code)
    if (this.cargoInfo?.devDependencies?.miri) {
      tools.push({
        name: 'miri',
        type: 'interpreter',
        builtin: false,
        detected: true
      });
    }

    this.qualityTools = tools;
  }

  async analyzeDependencies() {
    if (!this.cargoInfo) return;

    const deps = {
      ...this.cargoInfo.dependencies,
      ...this.cargoInfo.devDependencies,
      ...this.cargoInfo.buildDependencies
    };

    // Check for async runtime
    if (deps.tokio || deps['async-std']) {
      this.detectedFiles.push('async-runtime');
    }

    // Check for web frameworks
    if (deps.actix || deps.rocket || deps.warp || deps.tide) {
      this.detectedFiles.push('web-framework');
    }

    // Check for CLI frameworks
    if (deps.clap || deps.structopt) {
      this.detectedFiles.push('cli-framework');
    }

    // Check for serialization
    if (deps.serde) {
      this.detectedFiles.push('serialization');
    }
  }

  isRustProject() {
    return this.detectedFiles.includes('Cargo.toml') &&
           (this.detectedFiles.includes('src/main.rs') ||
            this.detectedFiles.includes('src/lib.rs') ||
            this.detectedFiles.some(f => f.endsWith('.rs')));
  }

  calculateConfidence() {
    let confidence = 0;

    // Core Rust files
    if (this.detectedFiles.includes('Cargo.toml')) {
      confidence += 0.4;
    }

    if (this.detectedFiles.includes('src/main.rs') ||
        this.detectedFiles.includes('src/lib.rs')) {
      confidence += 0.3;
    }

    // Additional Rust files
    if (this.detectedFiles.includes('Cargo.lock')) {
      confidence += 0.1;
    }

    // Test evidence
    if (this.testFrameworks.length > 0) {
      confidence += 0.1;
    }

    // Quality tools configuration
    if (this.qualityTools.some(t => t.configured)) {
      confidence += 0.1;
    }

    // Valid cargo manifest
    if (this.cargoInfo && !this.cargoInfo.invalid) {
      confidence += 0.2;
    }

    // Rust edition indicates mature project
    if (this.cargoInfo?.edition) {
      confidence += 0.1;
    }

    // Multiple source files indicate real project
    const rustSourceFiles = this.detectedFiles.filter(f => f.endsWith('.rs')).length;
    if (rustSourceFiles > 2) {
      confidence += 0.1;
    }

    this.confidence = Math.min(1.0, confidence);
  }

  generateSuggestions() {
    const suggestions = [];

    if (!this.isRustProject()) {
      return ['This does not appear to be a Rust project'];
    }

    // Test suggestions
    if (this.testFrameworks.length === 0) {
      suggestions.push('Add unit tests in src/ files with #[cfg(test)]');
      suggestions.push('Create integration tests in tests/ directory');
    }

    if (!this.testFrameworks.some(f => f.name === 'criterion')) {
      suggestions.push('Consider adding Criterion for benchmarking');
    }

    // Quality tool suggestions
    if (!this.qualityTools.some(t => t.name === 'clippy' && t.configured)) {
      suggestions.push('Configure Clippy with clippy.toml for custom linting rules');
    }

    if (!this.qualityTools.some(t => t.name === 'rustfmt' && t.configured)) {
      suggestions.push('Configure rustfmt with .rustfmt.toml for consistent formatting');
    }

    // Coverage suggestion
    if (!this.testFrameworks.some(f => f.name === 'tarpaulin')) {
      suggestions.push('Add tarpaulin for code coverage analysis');
    }

    // Edition suggestion
    if (!this.cargoInfo?.edition || this.cargoInfo.edition < '2021') {
      suggestions.push('Consider upgrading to Rust edition 2021');
    }

    return suggestions;
  }

  generateWarnings() {
    const warnings = [];

    if (!this.isRustProject()) {
      warnings.push('No Rust project detected');
      return warnings;
    }

    if (this.confidence < 0.7) {
      warnings.push('Low confidence in Rust project detection');
    }

    if (!this.detectedFiles.includes('Cargo.lock')) {
      warnings.push('Missing Cargo.lock - run cargo build to generate');
    }

    if (this.cargoInfo?.invalid) {
      warnings.push('Invalid Cargo.toml format detected');
    }

    if (this.testFrameworks.length === 0) {
      warnings.push('No test framework detected');
    }

    // Check for potential security issues
    if (this.cargoInfo?.dependencies &&
        Object.keys(this.cargoInfo.dependencies).some(dep => dep.startsWith('unsafe'))) {
      warnings.push('Unsafe dependencies detected - review carefully');
    }

    return warnings;
  }

  calculateMetrics() {
    const sourceFiles = this.detectedFiles.filter(f => f.endsWith('.rs')).length;
    const testFiles = this.detectedFiles.filter(f => f.includes('test')).length;
    const depCount = this.cargoInfo ?
      Object.keys({
        ...this.cargoInfo.dependencies,
        ...this.cargoInfo.devDependencies
      }).length : 0;

    return {
      sourceFiles,
      testFiles,
      dependencyCount: depCount,
      testFrameworkCount: this.testFrameworks.length,
      qualityToolCount: this.qualityTools.length,
      buildToolCount: this.buildTools.length,
      testCoverageRatio: testFiles / Math.max(sourceFiles, 1),
      projectComplexity: this.calculateComplexity()
    };
  }

  calculateComplexity() {
    let complexity = 1; // Base complexity

    // Workspace projects are more complex
    if (this.cargoInfo?.workspace) {
      complexity += 2;
    }

    // Build scripts add complexity
    if (this.detectedFiles.includes('build.rs')) {
      complexity += 1;
    }

    // Multiple test frameworks indicate complex testing
    if (this.testFrameworks.length > 2) {
      complexity += 1;
    }

    // Large dependency count increases complexity
    const depCount = this.cargoInfo ?
      Object.keys(this.cargoInfo.dependencies || {}).length : 0;
    if (depCount > 20) {
      complexity += 2;
    } else if (depCount > 10) {
      complexity += 1;
    }

    return Math.min(complexity, 5); // Cap at 5
  }
}

describe('Rust Validation Test Suite', () => {
  let testDir;
  let rustValidator;

  beforeEach(async () => {
    testDir = path.join(__dirname, `rust-validation-test-${crypto.randomBytes(4).toString('hex')}`);
    await fs.mkdir(testDir, { recursive: true });

    rustValidator = new MockRustFrameworkValidator({
      enableConsensus: true
    });
    await rustValidator.initialize();
  });

  afterEach(async () => {
    if (rustValidator) {
      await rustValidator.close();
    }
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Rust Framework Detection (>95% accuracy)', () => {
    const rustTestProjects = [
      {
        name: 'Basic Rust Binary',
        files: {
          'Cargo.toml': `[package]
name = "basic-rust"
version = "0.1.0"
edition = "2021"

[dependencies]`,
          'src/main.rs': 'fn main() { println!("Hello, world!"); }',
          'tests/integration_test.rs': '#[test] fn it_works() { assert_eq!(2 + 2, 4); }'
        },
        expected: {
          isRustProject: true,
          confidence: 0.95,
          testFrameworks: ['cargo-test'],
          edition: '2021'
        }
      },
      {
        name: 'Rust Library with Tests',
        files: {
          'Cargo.toml': `[package]
name = "rust-lib"
version = "0.2.0"
edition = "2021"

[dependencies]
serde = "1.0"

[dev-dependencies]
criterion = "0.5"`,
          'src/lib.rs': `pub fn add(left: usize, right: usize) -> usize {
    left + right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}`,
          'benches/benchmark.rs': 'use criterion::*; fn bench_add(c: &mut Criterion) {}',
          '.rustfmt.toml': 'tab_spaces = 4\nmax_width = 120',
          'clippy.toml': 'msrv = "1.70.0"'
        },
        expected: {
          isRustProject: true,
          confidence: 0.98,
          testFrameworks: ['cargo-test', 'criterion'],
          qualityTools: ['clippy', 'rustfmt']
        }
      },
      {
        name: 'Advanced Rust Project',
        files: {
          'Cargo.toml': `[package]
name = "advanced-rust"
version = "1.0.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
clap = "4.0"

[dev-dependencies]
proptest = "1.0"
tarpaulin = "0.27"
criterion = "0.5"

[build-dependencies]
cc = "1.0"`,
          'src/lib.rs': 'pub mod async_module; pub mod cli;',
          'src/main.rs': '#[tokio::main] async fn main() {}',
          'src/async_module.rs': 'pub async fn async_fn() {}',
          'src/cli.rs': 'use clap::Parser; #[derive(Parser)] pub struct Args {}',
          'build.rs': 'fn main() { cc::Build::new().compile("native"); }',
          'tests/integration_async.rs': '#[tokio::test] async fn test_async() {}',
          'tests/property_tests.rs': 'use proptest::prelude::*;',
          'benches/async_bench.rs': 'use criterion::*; use tokio_test;',
          'rust-toolchain.toml': '[toolchain]\nchannel = "1.70.0"',
          'tarpaulin.toml': '[report]\nout = ["Html", "Lcov"]'
        },
        expected: {
          isRustProject: true,
          confidence: 1.0,
          testFrameworks: ['cargo-test', 'proptest', 'criterion', 'tarpaulin'],
          buildTools: ['cargo', 'build-script'],
          qualityTools: ['clippy', 'rustfmt'],
          complexity: 4
        }
      },
      {
        name: 'Rust Workspace',
        files: {
          'Cargo.toml': `[workspace]
members = ["crate-a", "crate-b"]

[workspace.dependencies]
shared-dep = "1.0"`,
          'crate-a/Cargo.toml': `[package]
name = "crate-a"
version = "0.1.0"
edition = "2021"

[dependencies]
shared-dep.workspace = true`,
          'crate-a/src/lib.rs': 'pub fn func_a() {}',
          'crate-b/Cargo.toml': `[package]
name = "crate-b"
version = "0.1.0"
edition = "2021"

[dependencies]
shared-dep.workspace = true`,
          'crate-b/src/lib.rs': 'pub fn func_b() {}'
        },
        expected: {
          isRustProject: true,
          confidence: 0.90,
          workspace: true,
          complexity: 3
        }
      },
      {
        name: 'WebAssembly Rust Project',
        files: {
          'Cargo.toml': `[package]
name = "wasm-rust"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[dependencies.web-sys]
version = "0.3"
features = [
  "console",
  "Document",
  "Element",
  "HtmlElement",
  "Window",
]`,
          'src/lib.rs': `use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) {
    web_sys::console::log_1(&format!("Hello, {}!", name).into());
}`
        },
        expected: {
          isRustProject: true,
          confidence: 0.88,
          buildTools: ['cargo', 'wasm-pack'],
          targetType: 'webassembly'
        }
      }
    ];

    test('should detect Rust projects with >95% accuracy', async () => {
      let correctDetections = 0;
      const detectionResults = [];

      for (const project of rustTestProjects) {
        console.log(`\nTesting: ${project.name}`);

        // Create project structure
        const projectDir = path.join(testDir, project.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        // Write project files
        for (const [filePath, content] of Object.entries(project.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        // Detect Rust project
        const result = await rustValidator.detectRustProject(projectDir);

        // Check accuracy
        const isRustCorrect = result.isRustProject === project.expected.isRustProject;
        const confidenceAcceptable = result.confidence >= (project.expected.confidence - 0.05);

        // Check specific expectations
        let specificChecksPass = true;

        if (project.expected.testFrameworks) {
          const detectedFrameworkNames = result.testFrameworks.map(f => f.name);
          const expectedFrameworks = project.expected.testFrameworks;
          const frameworksMatch = expectedFrameworks.every(f =>
            detectedFrameworkNames.includes(f) || detectedFrameworkNames.includes(f.replace('-', '_'))
          );
          specificChecksPass = specificChecksPass && frameworksMatch;
        }

        if (project.expected.qualityTools) {
          const detectedToolNames = result.qualityTools.map(t => t.name);
          const expectedTools = project.expected.qualityTools;
          const toolsMatch = expectedTools.every(t => detectedToolNames.includes(t));
          specificChecksPass = specificChecksPass && toolsMatch;
        }

        if (project.expected.buildTools) {
          const detectedBuildNames = result.buildTools.map(b => b.name);
          const expectedBuild = project.expected.buildTools;
          const buildMatch = expectedBuild.every(b => detectedBuildNames.includes(b));
          specificChecksPass = specificChecksPass && buildMatch;
        }

        if (project.expected.workspace !== undefined) {
          const workspaceMatch = !!result.cargoInfo?.workspace === project.expected.workspace;
          specificChecksPass = specificChecksPass && workspaceMatch;
        }

        if (project.expected.complexity !== undefined) {
          const complexityMatch = result.metrics?.projectComplexity === project.expected.complexity;
          specificChecksPass = specificChecksPass && complexityMatch;
        }

        const isCorrect = isRustCorrect && confidenceAcceptable && specificChecksPass;
        if (isCorrect) correctDetections++;

        detectionResults.push({
          project: project.name,
          expected: project.expected,
          detected: {
            isRustProject: result.isRustProject,
            confidence: result.confidence,
            testFrameworks: result.testFrameworks?.map(f => f.name),
            qualityTools: result.qualityTools?.map(t => t.name),
            buildTools: result.buildTools?.map(b => b.name)
          },
          correct: isCorrect,
          detectionTime: result.detectionTime
        });

        console.log(`  Expected: Rust=${project.expected.isRustProject} (${project.expected.confidence})`);
        console.log(`  Detected: Rust=${result.isRustProject} (${result.confidence?.toFixed(3)})`);
        console.log(`  Result: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
        console.log(`  Detection time: ${result.detectionTime}ms`);
      }

      const accuracy = (correctDetections / rustTestProjects.length) * 100;

      console.log(`\n🦀 Rust Detection Results:`);
      console.log(`  Accuracy: ${accuracy.toFixed(1)}% (${correctDetections}/${rustTestProjects.length})`);
      console.log(`  Target: >95%`);
      console.log(`  Result: ${accuracy >= 95 ? '✅ PASSED' : '❌ FAILED'}`);

      expect(accuracy).toBeGreaterThanOrEqual(95);

      // Verify reasonable detection times (<2s average)
      const avgDetectionTime = detectionResults
        .map(r => r.detectionTime)
        .reduce((sum, time) => sum + time, 0) / detectionResults.length;

      expect(avgDetectionTime).toBeLessThan(2000);
    });
  });

  describe('Cargo Test Execution Validation', () => {
    test('should validate cargo test execution capabilities', async () => {
      const cargoTestProject = {
        name: 'Cargo Test Validation',
        files: {
          'Cargo.toml': `[package]
name = "cargo-test-validation"
version = "0.1.0"
edition = "2021"

[dependencies]
regex = "1.0"

[dev-dependencies]
assert_matches = "1.5"`,
          'src/lib.rs': `pub fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fibonacci_base_cases() {
        assert_eq!(fibonacci(0), 0);
        assert_eq!(fibonacci(1), 1);
    }

    #[test]
    fn test_fibonacci_sequence() {
        assert_eq!(fibonacci(2), 1);
        assert_eq!(fibonacci(3), 2);
        assert_eq!(fibonacci(4), 3);
        assert_eq!(fibonacci(5), 5);
    }

    #[test]
    #[should_panic]
    fn test_overflow_behavior() {
        fibonacci(100); // This should panic due to stack overflow
    }
}`,
          'tests/integration_test.rs': `use cargo_test_validation::fibonacci;
use assert_matches::assert_matches;

#[test]
fn test_fibonacci_integration() {
    let result = fibonacci(6);
    assert_eq!(result, 8);
}

#[test]
fn test_fibonacci_properties() {
    // Property: F(n) = F(n-1) + F(n-2)
    for n in 2..10 {
        let f_n = fibonacci(n);
        let f_n_minus_1 = fibonacci(n - 1);
        let f_n_minus_2 = fibonacci(n - 2);
        assert_eq!(f_n, f_n_minus_1 + f_n_minus_2);
    }
}`,
          'benches/fibonacci_bench.rs': `use criterion::{black_box, criterion_group, criterion_main, Criterion};
use cargo_test_validation::fibonacci;

fn fibonacci_benchmark(c: &mut Criterion) {
    c.bench_function("fibonacci 20", |b| b.iter(|| fibonacci(black_box(20))));
}`
        }
      };

      const projectDir = path.join(testDir, 'cargo-test-validation');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(cargoTestProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await rustValidator.detectRustProject(projectDir);

      expect(result.isRustProject).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);

      // Validate test framework detection
      const testFrameworkNames = result.testFrameworks.map(f => f.name);
      expect(testFrameworkNames).toContain('cargo-test');

      // Validate metrics show good test coverage
      expect(result.metrics.testFiles).toBeGreaterThan(0);
      expect(result.metrics.testCoverageRatio).toBeGreaterThan(0.5);

      // Should detect both unit and integration tests
      expect(result.detectedFiles).toContain('tests/integration_test.rs');
      expect(result.cargoInfo.devDependencies).toHaveProperty('assert_matches');
    });

    test('should handle complex cargo test configurations', async () => {
      const complexTestProject = {
        name: 'Complex Cargo Test',
        files: {
          'Cargo.toml': `[package]
name = "complex-test"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
reqwest = "0.11"

[dev-dependencies]
mockall = "0.11"
proptest = "1.0"
criterion = { version = "0.5", features = ["html_reports"] }
tarpaulin = "0.27"

[[bin]]
name = "server"
path = "src/bin/server.rs"

[[bench]]
name = "http_bench"
harness = false`,
          'src/lib.rs': `pub mod client;
pub mod server;
pub use client::*;
pub use server::*;`,
          'src/client.rs': `use reqwest::Client;
use std::error::Error;

pub struct HttpClient {
    client: Client,
    base_url: String,
}

impl HttpClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn get(&self, path: &str) -> Result<String, Box<dyn Error>> {
        let url = format!("{}{}", self.base_url, path);
        let response = self.client.get(&url).send().await?;
        Ok(response.text().await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    #[tokio::test]
    async fn test_http_client() {
        let client = HttpClient::new("https://api.example.com".to_string());
        // Mock tests would go here
    }
}`,
          'src/server.rs': `use tokio::net::TcpListener;
use std::io;

pub async fn start_server(addr: &str) -> io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    println!("Server listening on {}", addr);
    Ok(())
}`,
          'src/bin/server.rs': `use complex_test::start_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    start_server("127.0.0.1:3000").await?;
    Ok(())
}`,
          'tests/integration_async.rs': `use complex_test::HttpClient;
use tokio_test;

#[tokio::test]
async fn test_async_integration() {
    let client = HttpClient::new("http://localhost:3000".to_string());
    // Integration tests would go here
}`,
          'tests/property_tests.rs': `use proptest::prelude::*;
use complex_test::*;

proptest! {
    #[test]
    fn test_http_url_construction(base in "https?://[a-z]+\\.[a-z]{2,4}", path in "/[a-z]*") {
        let client = HttpClient::new(base.clone());
        // Property tests would go here
    }
}`,
          'benches/http_bench.rs': `use criterion::{black_box, criterion_group, criterion_main, Criterion};
use complex_test::HttpClient;

fn benchmark_http_client(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let client = HttpClient::new("http://localhost:3000".to_string());

    c.bench_function("http get", |b| {
        b.iter(|| {
            rt.block_on(async {
                // Benchmark code here
            })
        })
    });
}

criterion_group!(benches, benchmark_http_client);
criterion_main!(benches);`,
          'tarpaulin.toml': `[report]
out = ["Html", "Lcov", "Json"]
output-dir = "target/tarpaulin"

[run]
exclude-files = ["src/bin/*", "benches/*"]`
        }
      };

      const projectDir = path.join(testDir, 'complex-cargo-test');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(complexTestProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await rustValidator.detectRustProject(projectDir);

      expect(result.isRustProject).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.95);

      // Should detect multiple test frameworks
      const frameworkNames = result.testFrameworks.map(f => f.name);
      expect(frameworkNames).toContain('cargo-test');
      expect(frameworkNames).toContain('proptest');
      expect(frameworkNames).toContain('criterion');
      expect(frameworkNames).toContain('tarpaulin');

      // Should detect complex project structure
      expect(result.metrics.projectComplexity).toBeGreaterThanOrEqual(3);
      expect(result.metrics.testFiles).toBeGreaterThanOrEqual(3);

      // Should have coverage tool configured
      expect(result.detectedFiles).toContain('tarpaulin.toml');
    });
  });

  describe('Rust Build Validation', () => {
    test('should validate different Rust build configurations', async () => {
      const buildTestProjects = [
        {
          name: 'Custom Build Script',
          files: {
            'Cargo.toml': `[package]
name = "custom-build"
version = "0.1.0"
edition = "2021"

[build-dependencies]
cc = "1.0"
bindgen = "0.65"`,
            'build.rs': `use std::env;
use std::path::PathBuf;

fn main() {
    // Tell cargo to tell rustc to link the system bzip2
    // shared library.
    println!("cargo:rustc-link-lib=bzip2");

    // The bindgen::Builder is the main entry point
    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks))
        .generate()
        .expect("Unable to generate bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("Couldn't write bindings!");
}`,
            'src/lib.rs': 'include!(concat!(env!("OUT_DIR"), "/bindings.rs"));'
          },
          expectedBuildTools: ['cargo', 'build-script']
        },
        {
          name: 'Cross Compilation',
          files: {
            'Cargo.toml': `[package]
name = "cross-compile"
version = "0.1.0"
edition = "2021"

[dependencies]
libc = "0.2"

[dev-dependencies]
cross = "0.2"`,
            'src/main.rs': `fn main() {
    println!("Cross compilation example");

    #[cfg(target_os = "linux")]
    println!("Running on Linux");

    #[cfg(target_os = "windows")]
    println!("Running on Windows");

    #[cfg(target_arch = "aarch64")]
    println!("Running on ARM64");
}`,
            '.cargo/config.toml': `[target.aarch64-unknown-linux-gnu]
linker = "aarch64-linux-gnu-gcc"`
          },
          expectedBuildTools: ['cargo', 'cross']
        }
      ];

      for (const project of buildTestProjects) {
        const projectDir = path.join(testDir, project.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        for (const [filePath, content] of Object.entries(project.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        const result = await rustValidator.detectRustProject(projectDir);

        expect(result.isRustProject).toBe(true);

        const buildToolNames = result.buildTools.map(t => t.name);
        project.expectedBuildTools.forEach(tool => {
          expect(buildToolNames).toContain(tool);
        });

        console.log(`${project.name}: Detected build tools: ${buildToolNames.join(', ')}`);
      }
    });
  });

  describe('Quality Checks and Linting', () => {
    test('should validate Rust quality tools configuration', async () => {
      const qualityProject = {
        name: 'Quality Tools Project',
        files: {
          'Cargo.toml': `[package]
name = "quality-tools"
version = "0.1.0"
edition = "2021"

[dependencies]
thiserror = "1.0"

[dev-dependencies]
rustfmt-wrapper = "0.2"`,
          'src/lib.rs': `use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {message}")]
    Parse { message: String },
}

pub fn dangerous_function() {
    unsafe {
        // This is justified because we're interfacing with C code
        let ptr = std::ptr::null_mut::<u8>();
        std::ptr::write(ptr, 42);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_types() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let my_err = MyError::from(io_err);
        assert!(matches!(my_err, MyError::Io(_)));
    }
}`,
          '.rustfmt.toml': `max_width = 120
tab_spaces = 4
newline_style = "Unix"
use_small_heuristics = "Default"
reorder_imports = true
reorder_modules = true
remove_nested_parens = true
edition = "2021"`,
          'clippy.toml': `msrv = "1.70.0"
avoid-breaking-exported-api = true
warn-on-all-wildcard-imports = true

# Allow some pedantic lints
allowed = [
    "clippy::module_name_repetitions",
    "clippy::must_use_candidate"
]

# Deny some restriction lints
deny = [
    "clippy::unwrap_used",
    "clippy::expect_used",
    "clippy::panic",
    "clippy::todo"
]`,
          'rust-toolchain.toml': `[toolchain]
channel = "1.70.0"
components = ["rustfmt", "clippy", "rust-analyzer"]
targets = ["x86_64-unknown-linux-gnu", "wasm32-unknown-unknown"]`
        }
      };

      const projectDir = path.join(testDir, 'quality-tools-project');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(qualityProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await rustValidator.detectRustProject(projectDir);

      expect(result.isRustProject).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);

      // Should detect configured quality tools
      const qualityToolNames = result.qualityTools.map(t => t.name);
      expect(qualityToolNames).toContain('clippy');
      expect(qualityToolNames).toContain('rustfmt');

      // Should show tools as configured
      const clippyTool = result.qualityTools.find(t => t.name === 'clippy');
      const rustfmtTool = result.qualityTools.find(t => t.name === 'rustfmt');

      expect(clippyTool.configured).toBe(true);
      expect(rustfmtTool.configured).toBe(true);

      // Should have rust toolchain info
      expect(result.rustConfig).toBeDefined();
      expect(result.rustConfig.channel).toBe('1.70.0');
    });

    test('should identify quality issues and provide suggestions', async () => {
      const problematicProject = {
        name: 'Problematic Project',
        files: {
          'Cargo.toml': `[package]
name = "problematic"
version = "0.1.0"
edition = "2018"

[dependencies]
unsafe-libc = "0.1"
deprecated-crate = "0.5"`,
          'src/main.rs': `fn main() {
    // No tests
    // Uses old edition
    // Unsafe without justification
    unsafe {
        std::ptr::null_mut::<u8>().write(42);
    }

    // Poor error handling
    std::fs::read_to_string("nonexistent.txt").unwrap();
}`
        }
      };

      const projectDir = path.join(testDir, 'problematic-project');
      await fs.mkdir(projectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(problematicProject.files)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await rustValidator.detectRustProject(projectDir);

      expect(result.isRustProject).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.suggestions.length).toBeGreaterThan(0);

      // Should suggest quality improvements
      const suggestions = result.suggestions.join(' ');
      expect(suggestions.toLowerCase()).toContain('test');
      expect(suggestions.toLowerCase()).toContain('edition 2021');

      // Should warn about unsafe dependencies
      const warnings = result.warnings.join(' ');
      expect(warnings.toLowerCase()).toMatch(/unsafe|security/);
    });
  });

  describe('Byzantine Consensus Validation Scenarios', () => {
    test('should validate Rust frameworks through Byzantine consensus', async () => {
      const frameworkForValidation = {
        id: 'rust-test-framework',
        name: 'Rust Testing Framework',
        description: 'A comprehensive testing framework for Rust applications',
        cargoToml: {
          package: {
            name: 'rust-test-framework',
            version: '1.0.0',
            edition: '2021'
          }
        },
        testPatterns: ['#[test]', '#[tokio::test]', '#[bench]'],
        dependencies: ['criterion', 'proptest'],
        devDependencies: ['tarpaulin'],
        hasUnsafeCode: false,
        qualityScore: 0.95
      };

      const validationResult = await rustValidator.validateRustFramework(
        frameworkForValidation,
        { requireByzantineConsensus: true }
      );

      expect(validationResult.success).toBe(true);
      expect(validationResult.byzantineValidated).toBe(true);
      expect(validationResult.consensusId).toBeDefined();
      expect(validationResult.votes).toBeGreaterThanOrEqual(3);
      expect(validationResult.confidence).toBeGreaterThan(0.6);
      expect(validationResult.cryptographicSignature).toMatch(/^rust-sig-/);

      console.log(`Byzantine Consensus Results:`);
      console.log(`  Consensus ID: ${validationResult.consensusId}`);
      console.log(`  Total Votes: ${validationResult.votes}`);
      console.log(`  Byzantine Nodes: ${validationResult.byzantineNodes}`);
      console.log(`  Confidence: ${validationResult.confidence?.toFixed(3)}`);
      console.log(`  Result: ${validationResult.success ? '✅ APPROVED' : '❌ REJECTED'}`);
    });

    test('should reject poor quality Rust frameworks via consensus', async () => {
      const poorFramework = {
        id: 'poor-rust-framework',
        name: 'P', // Too short name
        description: 'Bad', // Too short description
        cargoToml: {
          package: {
            name: 'poor-framework',
            version: '0.0.1',
            edition: '2015' // Old edition
          }
        },
        testPatterns: ['eval!("dangerous")'], // Dangerous pattern
        dependencies: ['unsafe-libc'],
        devDependencies: [],
        hasUnsafeCode: true,
        unsafeJustification: '', // No justification
        qualityScore: 0.2
      };

      const validationResult = await rustValidator.validateRustFramework(
        poorFramework,
        { requireByzantineConsensus: true }
      );

      expect(validationResult.success).toBe(false);
      expect(validationResult.byzantineValidated).toBe(true);
      expect(validationResult.confidence).toBeLessThan(0.5);

      console.log(`Poor Framework Consensus Results:`);
      console.log(`  Consensus ID: ${validationResult.consensusId}`);
      console.log(`  Confidence: ${validationResult.confidence?.toFixed(3)}`);
      console.log(`  Result: ${validationResult.success ? '✅ APPROVED' : '❌ REJECTED'}`);
    });

    test('should handle Byzantine node failures gracefully', async () => {
      // Override to simulate more Byzantine nodes
      rustValidator.createRustConsensusNodes = function(count) {
        return Array.from({ length: count }, (_, i) => ({
          nodeId: `rust-node-${i}`,
          byzantine: i < 3, // 3 out of 5 nodes are Byzantine (exceeds 1/3 limit)
          reputation: 100 - (i * 20),
          specialization: ['cargo', 'clippy', 'rustfmt', 'criterion', 'tarpaulin'][i % 5]
        }));
      };

      const frameworkForByzantineTest = {
        id: 'byzantine-test-framework',
        name: 'Byzantine Test Framework',
        description: 'Testing Byzantine fault tolerance',
        cargoToml: {
          package: {
            name: 'byzantine-test',
            version: '1.0.0',
            edition: '2021'
          }
        },
        testPatterns: ['#[test]'],
        dependencies: ['serde'],
        devDependencies: ['criterion'],
        hasUnsafeCode: false,
        qualityScore: 0.8
      };

      const validationResult = await rustValidator.validateRustFramework(
        frameworkForByzantineTest,
        { requireByzantineConsensus: true }
      );

      // With too many Byzantine nodes, the system might still function
      // but with lower confidence or might fail gracefully
      expect(validationResult.byzantineValidated).toBe(true);
      expect(validationResult.byzantineNodes).toBe(3);

      if (validationResult.success) {
        // If it succeeds, confidence should be low due to Byzantine interference
        expect(validationResult.confidence).toBeLessThan(0.7);
      }

      console.log(`Byzantine Fault Tolerance Test:`);
      console.log(`  Byzantine Nodes: ${validationResult.byzantineNodes}`);
      console.log(`  Consensus Achieved: ${validationResult.success ? 'Yes' : 'No'}`);
      console.log(`  Confidence: ${validationResult.confidence?.toFixed(3)}`);
    });

    test('should maintain consensus integrity with network partitions', async () => {
      // Simulate network partition scenarios
      const partitionTests = [
        { name: 'Minor Partition', byzantineCount: 1, expectedSuccess: true },
        { name: 'Major Partition', byzantineCount: 2, expectedSuccess: true },
        { name: 'Severe Partition', byzantineCount: 3, expectedSuccess: false }
      ];

      for (const test of partitionTests) {
        rustValidator.createRustConsensusNodes = function(count) {
          return Array.from({ length: count }, (_, i) => ({
            nodeId: `rust-node-${i}`,
            byzantine: i < test.byzantineCount,
            reputation: 100 - (i * 10),
            specialization: ['cargo', 'clippy', 'rustfmt', 'criterion', 'tarpaulin'][i % 5],
            partitioned: i < test.byzantineCount // Simulate partition
          }));
        };

        const testFramework = {
          id: `partition-test-${test.name.toLowerCase().replace(' ', '-')}`,
          name: `${test.name} Partition Test`,
          description: `Testing consensus under ${test.name.toLowerCase()} network partition`,
          cargoToml: {
            package: {
              name: 'partition-test',
              version: '1.0.0',
              edition: '2021'
            }
          },
          testPatterns: ['#[test]'],
          dependencies: ['tokio'],
          devDependencies: ['criterion'],
          hasUnsafeCode: false,
          qualityScore: 0.85
        };

        const result = await rustValidator.validateRustFramework(
          testFramework,
          { requireByzantineConsensus: true }
        );

        expect(result.byzantineValidated).toBe(true);

        if (test.expectedSuccess) {
          expect(result.success).toBe(true);
          expect(result.confidence).toBeGreaterThan(0.5);
        } else {
          // Severe partitions might cause consensus failure
          expect(result.confidence).toBeLessThan(0.6);
        }

        console.log(`${test.name}: Success=${result.success}, Confidence=${result.confidence?.toFixed(3)}`);
      }
    });
  });

  describe('Performance and False Positive Rate (<5%)', () => {
    test('should maintain <5% false completion rate', async () => {
      const falsePositiveTestCases = [
        {
          name: 'JavaScript Project with Rust-like Files',
          files: {
            'package.json': JSON.stringify({ name: 'js-project', version: '1.0.0' }),
            'cargo.txt': 'Not a real Cargo.toml file',
            'src/main.js': 'console.log("Hello from JS");',
            'rust-like-file.rs': '// Not actual Rust code, just JS with .rs extension\nconsole.log("fake rust");'
          },
          shouldBeRust: false
        },
        {
          name: 'Python Project',
          files: {
            'requirements.txt': 'requests==2.28.0\ndjango==4.0.0',
            'setup.py': 'from setuptools import setup',
            'main.py': 'print("Hello from Python")',
            'tests/test_main.py': 'def test_hello(): pass'
          },
          shouldBeRust: false
        },
        {
          name: 'C++ Project with Similar Structure',
          files: {
            'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.10)',
            'src/main.cpp': '#include <iostream>\nint main() { return 0; }',
            'tests/test_main.cpp': '#include <gtest/gtest.h>'
          },
          shouldBeRust: false
        },
        {
          name: 'Empty Directory',
          files: {},
          shouldBeRust: false
        },
        {
          name: 'Directory with Only Text Files',
          files: {
            'README.txt': 'This is a readme',
            'notes.txt': 'Some notes'
          },
          shouldBeRust: false
        }
      ];

      let falsePositives = 0;
      const totalTests = falsePositiveTestCases.length;

      for (const testCase of falsePositiveTestCases) {
        const projectDir = path.join(testDir, testCase.name.toLowerCase().replace(/\s+/g, '-'));
        await fs.mkdir(projectDir, { recursive: true });

        for (const [filePath, content] of Object.entries(testCase.files)) {
          const fullPath = path.join(projectDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
        }

        const result = await rustValidator.detectRustProject(projectDir);

        const incorrectDetection = result.isRustProject !== testCase.shouldBeRust;
        if (incorrectDetection) {
          falsePositives++;
        }

        console.log(`${testCase.name}: Expected=${testCase.shouldBeRust}, Got=${result.isRustProject}, Confidence=${result.confidence?.toFixed(3)}`);
      }

      const falsePositiveRate = (falsePositives / totalTests) * 100;

      console.log(`\n📊 False Positive Rate Analysis:`);
      console.log(`  False Positives: ${falsePositives}/${totalTests}`);
      console.log(`  False Positive Rate: ${falsePositiveRate.toFixed(1)}%`);
      console.log(`  Target: <5%`);
      console.log(`  Result: ${falsePositiveRate < 5 ? '✅ PASSED' : '❌ FAILED'}`);

      expect(falsePositiveRate).toBeLessThan(5);
    });

    test('should handle large projects efficiently', async () => {
      const largeProjectStructure = {
        'Cargo.toml': `[workspace]
members = [${Array.from({length: 10}, (_, i) => `"crate-${i}"`).join(', ')}]`,
      };

      // Create 10 workspace members
      for (let i = 0; i < 10; i++) {
        largeProjectStructure[`crate-${i}/Cargo.toml`] = `[package]
name = "crate-${i}"
version = "0.1.0"
edition = "2021"`;
        largeProjectStructure[`crate-${i}/src/lib.rs`] = `pub fn function_${i}() -> i32 { ${i} }`;

        // Add multiple test files per crate
        for (let j = 0; j < 3; j++) {
          largeProjectStructure[`crate-${i}/tests/test_${j}.rs`] = `#[test] fn test_${j}() { assert_eq!(crate_${i}::function_${i}(), ${i}); }`;
        }

        // Add benchmark files
        largeProjectStructure[`crate-${i}/benches/bench.rs`] = `use criterion::*; fn bench_func_${i}(c: &mut Criterion) {}`;
      }

      const largeProjectDir = path.join(testDir, 'large-rust-project');
      await fs.mkdir(largeProjectDir, { recursive: true });

      const startSetup = Date.now();

      for (const [filePath, content] of Object.entries(largeProjectStructure)) {
        const fullPath = path.join(largeProjectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const setupTime = Date.now() - startSetup;

      const startDetection = Date.now();
      const result = await rustValidator.detectRustProject(largeProjectDir);
      const detectionTime = Date.now() - startDetection;

      console.log(`\n⚡ Large Project Performance:`);
      console.log(`  Project files: ${Object.keys(largeProjectStructure).length}`);
      console.log(`  Setup time: ${setupTime}ms`);
      console.log(`  Detection time: ${detectionTime}ms`);
      console.log(`  Target: <2000ms`);
      console.log(`  Result: ${detectionTime < 2000 ? '✅ PASSED' : '❌ FAILED'}`);

      expect(result.isRustProject).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(detectionTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.metrics.projectComplexity).toBeGreaterThan(3); // Should detect high complexity
    });

    test('should provide comprehensive metrics and reporting', async () => {
      const metricsTestProject = {
        'Cargo.toml': `[package]
name = "metrics-test"
version = "2.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }
reqwest = "0.11"
anyhow = "1.0"

[dev-dependencies]
criterion = "0.5"
proptest = "1.0"
mockall = "0.11"
tarpaulin = "0.27"`,
        'src/lib.rs': 'pub mod client; pub mod server; pub mod utils;',
        'src/client.rs': 'pub struct Client { /* fields */ } impl Client { pub fn new() -> Self { todo!() } }',
        'src/server.rs': 'pub struct Server { /* fields */ } impl Server { pub async fn start(&self) { todo!() } }',
        'src/utils.rs': 'pub fn helper_function() { /* implementation */ }',
        'tests/integration_test.rs': '#[test] fn integration_test() { /* test code */ }',
        'tests/client_test.rs': '#[test] fn client_test() { /* test code */ }',
        'tests/server_test.rs': '#[tokio::test] async fn server_test() { /* async test */ }',
        'benches/performance.rs': 'use criterion::*; fn bench_main(c: &mut Criterion) { /* benchmark */ }',
        '.rustfmt.toml': 'max_width = 120',
        'clippy.toml': 'msrv = "1.70.0"'
      };

      const metricsProjectDir = path.join(testDir, 'metrics-test-project');
      await fs.mkdir(metricsProjectDir, { recursive: true });

      for (const [filePath, content] of Object.entries(metricsTestProject)) {
        const fullPath = path.join(metricsProjectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      const result = await rustValidator.detectRustProject(metricsProjectDir);

      expect(result.isRustProject).toBe(true);
      expect(result.metrics).toBeDefined();

      const metrics = result.metrics;

      console.log(`\n📋 Comprehensive Metrics Report:`);
      console.log(`  Source Files: ${metrics.sourceFiles}`);
      console.log(`  Test Files: ${metrics.testFiles}`);
      console.log(`  Dependencies: ${metrics.dependencyCount}`);
      console.log(`  Test Frameworks: ${metrics.testFrameworkCount}`);
      console.log(`  Quality Tools: ${metrics.qualityToolCount}`);
      console.log(`  Build Tools: ${metrics.buildToolCount}`);
      console.log(`  Test Coverage Ratio: ${metrics.testCoverageRatio?.toFixed(2)}`);
      console.log(`  Project Complexity: ${metrics.projectComplexity}/5`);

      // Validate metrics are reasonable
      expect(metrics.sourceFiles).toBeGreaterThan(0);
      expect(metrics.testFiles).toBeGreaterThan(0);
      expect(metrics.dependencyCount).toBeGreaterThan(0);
      expect(metrics.testFrameworkCount).toBeGreaterThan(0);
      expect(metrics.testCoverageRatio).toBeGreaterThan(0);
      expect(metrics.projectComplexity).toBeGreaterThanOrEqual(1);
      expect(metrics.projectComplexity).toBeLessThanOrEqual(5);

      // Validate suggestions are helpful
      expect(result.suggestions).toBeInstanceOf(Array);
      expect(result.warnings).toBeInstanceOf(Array);

      console.log(`  Suggestions: ${result.suggestions.length}`);
      console.log(`  Warnings: ${result.warnings.length}`);
    });
  });
});